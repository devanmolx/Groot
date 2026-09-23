import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import { diffLines } from 'diff';
import chalk from 'chalk';

class Groot {

    constructor(repoPath = '.'){
        this.repoPath = path.join(repoPath, '.groot');
        this.objectsPath = path.join(this.repoPath, 'objects');
        this.headPath = path.join(this.repoPath, 'HEAD');
        this.indexPath = path.join(this.repoPath, 'index');

        this.init();
    }
    
    async init(){
        await fs.mkdir(this.objectsPath, { recursive: true });

        try {
            
            await fs.writeFile(this.headPath, '', {flag: 'wx'});
            await fs.writeFile(this.indexPath, JSON.stringify([]), {flag: 'wx'});

        } catch (error) {
            console.error("Already initialized .groot directory");
        }
    }

    hashObject(data){
        const hash = crypto.createHash('sha256').update(data, 'utf-8').digest('hex');
        return hash;
    }

    async add(file){
        const fileData = await fs.readFile(file, {encoding: 'utf-8'});
        const hash = this.hashObject(fileData);

        const objectPath = path.join(this.objectsPath, hash);
        await fs.writeFile(objectPath, fileData, {flag: 'wx'});

        await this.updateStagingArea(file, hash);
        console.log(`Added ${file} to staging area`);
    }

    async updateStagingArea(file, hash){
        const index = await JSON.parse(await fs.readFile(this.indexPath, {encoding: 'utf-8'}));
        index.push({file, hash});
        await fs.writeFile(this.indexPath, JSON.stringify(index));
    }

    async commit(message){

        const index = JSON.parse(await fs.readFile(this.indexPath, {encoding: 'utf-8'}));
        const parentCommit = await this.getCurrentHead();

        const commitData = {
            timeStamp: new Date().toISOString(),
            message,
            index,
            parent: parentCommit,
        }

        const commitHash = this.hashObject(JSON.stringify(commitData));
        const commitPath = path.join(this.objectsPath, commitHash);
        await fs.writeFile(commitPath, JSON.stringify(commitData));

        await fs.writeFile(this.headPath, commitHash);
        await fs.writeFile(this.indexPath, JSON.stringify([]));

        console.log(`committed successfully created: ${commitHash}`);
    }

    async getCurrentHead(){
        try {
            const head = await fs.readFile(this.headPath, {encoding: 'utf-8'});
            return head.trim();
        } catch (error) {
            return null;
        }
    }

    async log() {
        let currentCommitHash = await this.getCurrentHead();
    
        if (!currentCommitHash) {
            console.log("No commits yet.");
            return;
        }
    
        while (currentCommitHash) {
            const commitData = JSON.parse(
                await fs.readFile(
                    path.join(this.objectsPath, currentCommitHash),
                    { encoding: 'utf-8' }
                )
            );
    
            console.log(
                chalk.yellow(`commit ${currentCommitHash}`)
            );
    
            console.log(
                chalk.gray(
                    `Date: ${new Date(commitData.timeStamp).toLocaleString()}`
                )
            );
    
            console.log();
    
            console.log(
                `    ${commitData.message}`
            );
    
            console.log();
    
            currentCommitHash = commitData.parent;
        }
    }

    async showCommitDiff(commitHash) {
        const commitData = JSON.parse(
            await this.getCommitData(commitHash)
        );
    
        if (!commitData) {
            console.log("Commit not found");
            return;
        }
    
        console.log(
            chalk.yellow(`commit ${commitHash}`)
        );
    
        console.log(
            chalk.gray(`Date: ${new Date(commitData.timeStamp).toLocaleString()}`)
        );
    
        console.log();
    
        console.log(
            `    ${commitData.message}`
        );
    
        console.log();
    
        // First commit
        if (!commitData.parent) {
            console.log(chalk.gray("No parent commit — showing all files as added."));
            
            for (const file of commitData.index) {
                const fileContent = await this.getFileContent(file.hash);
    
                console.log(
                    chalk.cyan(`diff --groot a/${file.file} b/${file.file}`)
                );
    
                console.log(
                    chalk.green(`new file: ${file.file}`)
                );
    
                console.log();
    
                const lines = fileContent.split('\n');
    
                for (const line of lines) {
                    if (line !== '') {
                        console.log(chalk.green(`+${line}`));
                    }
                }
    
                console.log();
            }
    
            return;
        }
    
        const parentCommitData = JSON.parse(
            await this.getCommitData(commitData.parent)
        );
    
        for (const file of commitData.index) {
            const fileContent = await this.getFileContent(file.hash);
    
            const parentFileContent = await this.getParentFileContent(
                file.file,
                parentCommitData
            );
    
            console.log(
                chalk.cyan(
                    `diff --groot a/${file.file} b/${file.file}`
                )
            );
    
            if (parentFileContent === undefined) {
                console.log(
                    chalk.green(`new file: ${file.file}`)
                );
    
                console.log();
    
                const lines = fileContent.split('\n');
    
                for (const line of lines) {
                    if (line !== '') {
                        console.log(chalk.green(`+${line}`));
                    }
                }
    
                console.log();
                continue;
            }
    
            const diff = diffLines(
                parentFileContent,
                fileContent
            );
    
            diff.forEach(part => {
                const lines = part.value.split('\n');
    
                lines.forEach(line => {
                    if (line === '') return;
    
                    if (part.added) {
                        console.log(
                            chalk.green(`+${line}`)
                        );
                    } 
                    else if (part.removed) {
                        console.log(
                            chalk.red(`-${line}`)
                        );
                    } 
                    else {
                        console.log(
                            chalk.gray(` ${line}`)
                        );
                    }
                });
            });
    
            console.log();
        }
    }

    async getParentFileContent(filePath, parentCommitData){
        const parentFile = parentCommitData.index.find(file => file.file === filePath);

        if(parentFile){
            return await this.getFileContent(parentFile.hash);
        }

        return undefined;
    }

    async getFileContent(fileHash){
        const filePath = path.join(this.objectsPath, fileHash);
        return await fs.readFile(filePath, {encoding : 'utf-8'});       
    }

    async getCommitData(commitHash){
        const commitPath = path.join(this.objectsPath, commitHash);
        try {
            const data = await fs.readFile(commitPath, {encoding : 'utf-8'});
            return data;
        } catch (error) {
            console.log(error);
            return null;
        }
    }
}

(async() => {
    const groot = new Groot();
    // await groot.add('sample.txt');
    // await groot.add('new.txt');
    // await groot.commit('fifth commit');
    await groot.log();
    await groot.showCommitDiff("f87db82bf8b6f52e63296e3b70a46d94768c4a19b1921ecf99482d40ee3ffbce");
})();

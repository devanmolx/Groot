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

    async log(){
        let currentCommitHash = await this.getCurrentHead();

        while(currentCommitHash){
            const commitData = JSON.parse(await fs.readFile(path.join(this.objectsPath, currentCommitHash), {encoding : 'utf-8'}))
            console.log(`Commit: ${currentCommitHash}\nDate:${commitData.timeStamp} \n\n${commitData.message }`)

            currentCommitHash = commitData.parent
        }
    }

    async showCommitDiff(commitHash){

        const commitData = JSON.parse(await this.getCommitData(commitHash));

        if(!commitData){
            console.log("Commit not found");
            return;
        }

        for(const file of commitData.index){
            const fileContent = await this.getFileContent(file.hash);

            if(commitData.parent){
                const parentCommitData = JSON.parse(await this.getCommitData(commitData.parent));
                const parentFileContent = await this.getParentFileContent(file.path, parentCommitData);

                if(parentFileContent != undefined){
                    console.log("\n Diff: ")
                    const diff = diffLines(parentFileContent, fileContent);
                    
                    diff.forEach(part => {
                        if(part.added){
                            process.stdout.write(chalk.green("++ " +part.value));
                        }
                        else if(part.removed){
                            process.stdout.write(chalk.red("-- " + part.value));
                        }
                        else{
                            process.stdout.write(chalk.gray(part.value));
                        }
                    })

                    console.log()
                }
                else{
                    console.log("New file in this commit")
                }
            }
            else{
                console.log("First commit");
            }
        }
    }

    async getParentFileContent(filePath, parentCommitData){
        const parentFile = parentCommitData.index.find(file => file.path === filePath);

        if(parentFile){
            return await this.getFileContent(parentFile.hash);
        }

    }

    async getFileContent(fileHash){
        const filePath = path.join(this.objectsPath, fileHash);
        return fs.readFile(filePath, {encoding : 'utf-8'});       
    }

    async getCommitData(commitHash){
        const commitPath = path.join(this.objectsPath, commitHash);
        try {
            const data = fs.readFile(commitPath, {encoding : 'utf-8'});
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
    // await groot.commit('fifth commit');
    await groot.log();
    await groot.showCommitDiff("353134600411d32f890f5ab426b324872dd87f7457489ef357738323dc07796f");
})();

import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';

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
}

(async() => {
    const groot = new Groot();
    await groot.add('sample.txt');
    await groot.commit('second commit');
    await groot.log();
})();

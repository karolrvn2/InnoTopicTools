#!/usr/bin/env node
import dotenv from 'dotenv';
import { Dropbox } from 'dropbox';
import fetch from 'node-fetch';
import * as exifr from 'exifr';
import chalk from 'chalk'; // Add chalk for colored output


globalThis.fetch = fetch as any;
dotenv.config();

const DROPBOX_ACCESS_TOKEN = process.env.DROPBOX_ACCESS_TOKEN || 'your_access_token_here';
const SOURCE_FOLDER = '/Camera Uploads'; // Change this to your Dropbox folder
const TARGET_FOLDER = '/Camera Uploads By Date';

const dbx = new Dropbox({ accessToken: DROPBOX_ACCESS_TOKEN });
const isDryRun = process.argv.includes('--dry');
console.log(chalk.cyan(`Starting, isDryRun: ${isDryRun}`));

const startTime = Date.now(); // Record the start time

async function listFiles(folder: string) {
    let files: any[] = [];
    let response = await dbx.filesListFolder({ path: folder });

    files.push(...response.result.entries);

    while (response.result.has_more) {
        response = await dbx.filesListFolderContinue({
            cursor: response.result.cursor,
        });
        files.push(...response.result.entries);
    }

    return files;
}

async function downloadFile(filePath: string) {
    const response = await dbx.filesDownload({ path: filePath });
    return response.result;
}

async function extractExifDate(fileBuffer: Buffer): Promise<string | null> {
    try {
        const metadata = await exifr.parse(fileBuffer);
        if (metadata?.DateTimeOriginal) {
            const date = new Date(metadata.DateTimeOriginal);
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            return `${year}/${year}-${month}`;
        }
    } catch (error) {
        console.error(chalk.red('Error parsing EXIF data:'), error);
    }
    return null;
}

async function moveFile(filePath: string, destination: string) {
    console.log(chalk.yellow(`move: ${filePath} -> ${destination}`));
    if (isDryRun) {
    } else {
        await dbx.filesMoveV2({ from_path: filePath, to_path: destination });
        console.log(chalk.green(`Moved: ${filePath} -> ${destination}`));
    }
}

async function getDropboxFileDate(file: any): Promise<string> {
    // try {   
        const serverModified = new Date(file.server_modified);
        const clientModified = new Date(file.client_modified);
        const earlierDate = serverModified < clientModified ? serverModified : clientModified;

        const year = earlierDate.getFullYear();
        const month = String(earlierDate.getMonth() + 1).padStart(2, '0');
        return `${year}/${year}-${month}`;
    // } catch (error) {
    //     console.error(chalk.red('Error determining file date:'), error);
    //     return 'No Date';
    // }
}

async function processFiles() {
    // await delay(0);

    const files = await listFiles(SOURCE_FOLDER);
    console.log("files", files);
    const totalFiles = files.length;
    console.log(chalk.blue(`Total files in source directory: ${totalFiles}`));

    let fileIndex = 0;
    for (const file of files) {
        if (file['.tag'] !== 'file') continue;

        fileIndex++;
        console.log(chalk.cyan(`Processing file ${fileIndex} of ${totalFiles}: ${file.name}`));

        const folder = await getDropboxFileDate(file); // Use Dropbox file date
        const destinationFolder = folder || 'No Date';

        const destinationPath = `${TARGET_FOLDER}/${destinationFolder}/${file.name}`;
        await moveFile(file.path_lower!, destinationPath);
    }
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function measureExecutionTime<TResult>(fn: () => Promise<TResult>, description: string): Promise<TResult> {
    const startTime = Date.now();
    console.log(chalk.cyan(`Starting: ${description}`));

    let error = undefined;
    let result: TResult | undefined = undefined
    try {
        result = await fn();
    } catch (err) {
        console.error(chalk.red('Error during execution:'), error);
        error = err;
    }

    const endTime = Date.now();
    const elapsedTime = endTime - startTime;

    const hours = Math.floor(elapsedTime / (1000 * 60 * 60));
    const minutes = Math.floor((elapsedTime % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((elapsedTime % (1000 * 60)) / 1000);

    console.log(chalk.green(`Finished: ${description}. Total running time: ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`));
    if ( error ) {
        throw error
    }
    return result as TResult;
}

measureExecutionTime(processFiles, 'Processing Files').catch(error =>
    console.error(chalk.red('Error during processing:'), error)
);


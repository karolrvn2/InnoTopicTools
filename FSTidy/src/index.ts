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

async function listFiles(folder: string) {
    const response = await dbx.filesListFolder({ path: folder });
    return response.result.entries;
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
    if (isDryRun) {
        console.log(chalk.yellow(`[DRY RUN] Would move: ${filePath} -> ${destination}`));
    } else {
        await dbx.filesMoveV2({ from_path: filePath, to_path: destination });
        console.log(chalk.green(`Moved: ${filePath} -> ${destination}`));
    }
}

async function processFiles() {
    const files = await listFiles(SOURCE_FOLDER);
    console.log("files", files);
    const totalFiles = files.length;
    console.log(chalk.blue(`Total files in source directory: ${totalFiles}`));

    let fileIndex = 0;
    for (const file of files) {
        if (file['.tag'] !== 'file') continue;

        fileIndex++;
        console.log(chalk.cyan(`Processing file ${fileIndex} of ${totalFiles}: ${file.name}`));

        const fileData = await downloadFile(file.path_lower!);
        const buffer = Buffer.from((fileData as any).fileBinary as ArrayBuffer);
        
        const folder = await extractExifDate(buffer);
        if (!folder) continue;

        const destinationPath = `${TARGET_FOLDER}/${folder}/${file.name}`;
        await moveFile(file.path_lower!, destinationPath);
    }
}

processFiles().catch(error => console.error(chalk.red('Error during processing:'), error));


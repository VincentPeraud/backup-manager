import fs from 'fs';
import 'reflect-metadata';
import { Config, ConfigJob, ConfigJobSource, RsyncConfig } from './config.interface';
import { Utils } from './utils';
import ora, { Ora } from 'ora';
import path from 'path';
import os from 'os';
import { Rsync } from './rsync';
import dayjs from 'dayjs';
import { Mattermost } from './mattermost';

export class BackupManager {
    private config: Config;
    private spinner: Ora;

    private constructor() {
        this.spinner = ora();
    }

    public static async create(): Promise<BackupManager> {
        const instance = new BackupManager();
        await instance._loadConfig();
        await instance._checkConfig();

        return instance;
    }

    public async backup(): Promise<void> {
        for (const job of this.config.jobs) {
            try {
                await this.processJob(job);
                await this._notifyOnSuccess(job);
            } catch (error) {
                await this._notifyOnFailure(job, error);

                console.log('');
                console.log(error);
                console.log('');
            }
        }
    }

    async list(name: string): Promise<void> {
        Utils.headerTitle('List backups');

        await this._loadConfig();
        await this._checkConfig();

        const job = this.config.jobs.find((j) => j.name === name);
        if (!job) {
            throw new Error(`Job \`${name}\` not found`);
        }

        const destination = this.config.settings.destinations.find(
            (d) => d.name === job.destination.name,
        );
        if (!destination) {
            throw new Error(`Destination \`${job.destination.name}\` not found`);
        }

        const remoteFolder = job.destination.path.replace(/\/$/, '') + '/';

        console.log(remoteFolder);
    }

    private async _loadConfig(): Promise<void> {
        try {
            this.spinner.start('Loading config...');
            this.config = await Utils.parseAndValidateConfig('/config.yml');
            this.spinner.succeed('Load config');
        } catch (error) {
            this.spinner.fail('Config loading failed');
            throw error;
        }
    }

    private async _checkConfig(): Promise<void> {
        this.spinner.start('Checking config...');

        const errors: string[] = [];

        const usedDestinations: string[] = [];
        const jobNames: string[] = [];
        for (const job of this.config.jobs) {
            const destinationName = job.destination.name;
            const destinationPath = job.destination.path;
            const exists = this.config.settings.destinations.some(
                (d) => d.name === destinationName,
            );
            if (!exists) {
                errors.push(`Destination \`${destinationName}\` not found`);
            }
            if (usedDestinations.includes(destinationName + destinationPath)) {
                errors.push(
                    `Destination \`${destinationName}\` at path \`${destinationPath}\` used more than once`,
                );
            }
            usedDestinations.push(destinationName + destinationPath);

            const sourceNames: string[] = [];
            for (const source of job.sources) {
                if (sourceNames.includes(source.name)) {
                    errors.push(
                        `Source \`${source.name}\` used more than once for job \`${job.name}\``,
                    );
                }
                sourceNames.push(source.name);
            }

            if (jobNames.includes(job.name)) {
                errors.push(`Job name \`${job.name}\` already exists`);
            }
            jobNames.push(job.name);
        }

        // Display errors and exit if any
        if (errors.length > 0) {
            this.spinner.fail('Config check failed');
            throw new Error(errors.join('\n'));
        }

        this.spinner.succeed('Check config');
        console.log('');
    }

    public async processJob(job: ConfigJob): Promise<void> {
        console.log('');
        const title = `🚀 JOB: ${job.name}`;
        console.log(title);
        console.log('-'.repeat(title.length));

        // create temporary directory
        this.spinner.start('Creating temporary directory...');
        const tmpDir = path.join(os.tmpdir(), `backup-manager-${job.name}-${Date.now()}`);
        fs.mkdirSync(tmpDir, { recursive: true });
        this.spinner.succeed(`Create temporary directory`);

        // execute pre commands
        this.spinner.start(`Executing pre-commands...`);
        if (job?.pre_commands && job?.pre_commands.length > 0) {
            for (let command of job?.pre_commands) {
                command = command.replace('{{TMP_DIR}}', tmpDir);
                try {
                    await Utils.runCommand(command, []);
                } catch (error) {
                    this.spinner.fail(`Execute pre-commands`);
                    throw error;
                }
            }
            this.spinner.succeed(`Execute pre-commands`);
        } else {
            this.spinner.info(`No pre-commands to execute`);
        }

        // backup sources to destination
        const remoteFolderPrefix = this._generateRemoteFolderPrefix(job);
        await this._backupSources(job, remoteFolderPrefix, tmpDir);

        // clean up temporary directory
        this.spinner.start('Cleaning up temporary directory...');
        fs.rmSync(tmpDir, { recursive: true });
        this.spinner.succeed(`Clean temporary directory`);
    }

    private async _backupSources(
        job: ConfigJob,
        remoteFolderPrefix: string,
        tmpDir: string,
    ): Promise<void> {
        const config = this.config.settings.destinations.find(
            (d) => d.name === job.destination.name,
        );

        if (config.type === 's3') {
            throw new Error('S3 backup is not supported yet');
        }

        if (config instanceof RsyncConfig) {
            const rsync = new Rsync();
            await rsync.init(job, config);
            for (const source of job.sources) {
                // slugify source name
                source.name = Utils.slugify(source.name);
                source.path = source.path.replace('{{TMP_DIR}}', tmpDir);

                const spinnerText = `Backup source \`${source.name}\``;
                this.spinner.start(spinnerText);

                if (!fs.existsSync(source.path)) {
                    this.spinner.fail(spinnerText);
                    throw new Error(`Source path \`${source.path}\` does not exist`);
                }

                try {
                    await rsync.backup(source, remoteFolderPrefix, this.spinner);
                    this.spinner.succeed(spinnerText);
                } catch (error) {
                    this.spinner.fail(spinnerText);
                    throw error;
                }
            }
            // CleanUp Backup folder
            this.spinner.start('Clean up backup folder...');
            const result = await rsync.cleanUpBackupFolder(this.config.settings.retention);
            this.spinner.succeed(`Clean up backup folder (${result} backups removed)`);
        }
    }

    private _generateRemoteFolderPrefix(job: ConfigJob): string {
        const date = dayjs().format('YYYY-MM-DD-HH-mm-ss');

        return `${job.destination.path.replace(/\/$/, '')}/${date}/`;
    }

    private async _notifyOnSuccess(job: ConfigJob): Promise<void> {
        if (this.config.notifications.on_success.includes('mattermost')) {
            const results = [];
            for (const source of job.sources) {
                results.push(`- ${source.name} (${source.path})`);
            }
            const message = [
                `**🚀 ${this.config.settings.server_name} - ${job.name}**`,
                '',
                '',
                '✅ Backup completed successfully',
                ...results,
                '',
                '---',
            ].join('\n');
            await Mattermost.send(this.config.notifications.mattermost, message);
        }
    }

    private async _notifyOnFailure(job: ConfigJob, error: Error): Promise<void> {
        if (this.config.notifications.on_failure.includes('mattermost')) {
            const message = [
                `**🚀 ${this.config.settings.server_name} - ${job.name}**`,
                '',
                '',
                '❌ Backup failed',
                '```',
                error.message,
                '```',
                '---',
            ].join('\n');
            await Mattermost.send(this.config.notifications.mattermost, message);
        }
    }

    public getJobNames(): string[] {
        return this.config.jobs.map((j) => j.name);
    }

    public getJobByName(name: string): ConfigJob {
        return this.config.jobs.find((j) => j.name === name);
    }

    public async getJobBackups(job: ConfigJob): Promise<string[]> {
        const config = this.config.settings.destinations.find(
            (d) => d.name === job.destination.name,
        );

        if (config.type === 's3') {
            throw new Error('S3 backup is not supported yet');
        }

        if (config instanceof RsyncConfig) {
            const rsync = new Rsync();
            await rsync.init(job, config);
            const backups = await rsync.getExistingBackups();

            return backups;
        }

        return [];
    }

    public async downloadBackup(
        localFolder: string,
        job: ConfigJob,
        backup: string,
    ): Promise<void> {
        const config = this.config.settings.destinations.find(
            (d) => d.name === job.destination.name,
        );

        if (config.type === 's3') {
            throw new Error('S3 backup is not supported yet');
        }

        if (config instanceof RsyncConfig) {
            const rsync = new Rsync();
            await rsync.init(job, config);
            this.spinner.start(`Downloading backup \`${backup}\`...`);
            const localPath = await rsync.downloadBackup(localFolder, backup);
            this.spinner.succeed(`Backup \`${backup}\` downloaded to \`${localPath}\``);
        }
    }
}

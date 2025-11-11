import { ConfigJob, ConfigJobSource, ConfigRetention, RsyncConfig } from './config.interface';
import { Utils } from './utils';
import { Ora } from 'ora';
import * as _ from 'lodash';
import dayjs from 'dayjs';
import isoWeek from 'dayjs/plugin/isoWeek';

dayjs.extend(isoWeek);

export class Rsync {
    private _sshCommand: string;
    private _job: ConfigJob;
    private _config: RsyncConfig;
    private rsyncPermOptions =
        '--no-perms --no-owner --no-group --chmod=Du=rwx,Dg=rx,Do=rx,Fu=rw,Fg=r,Fo=r';

    async init(job: ConfigJob, config: RsyncConfig): Promise<void> {
        this._job = job;
        this._config = config;
        this._sshCommand = await this._initSsh(config);
    }

    async backup(source: ConfigJobSource, remoteFolderPrefix: string, spinner: Ora): Promise<void> {
        const localPath =
            source.type === 'file' ? source.path : source.path.replace(/\/$/, '') + '/';
        const remoteFolder = this._generateRemoteFolderName(remoteFolderPrefix, source);

        // get existing backups
        const spinnerPrefix = spinner.text;
        spinner.text = `${spinnerPrefix} - Get existing backups...`;
        const existingBackups = await this.getExistingBackups();

        if (existingBackups.length > 0) {
            // Copy last backup to destination
            spinner.text = `${spinnerPrefix} - Copy last backup to destination...`;
            await this._copyBackup(remoteFolderPrefix, existingBackups[0], source, remoteFolder);
        } else {
            await this._createRemoteFolder(remoteFolder);
        }

        // Rsync source
        spinner.text = `${spinnerPrefix} - Rsync source...`;
        await this._backupSource(localPath, remoteFolder);
    }

    private async _initSsh(config: RsyncConfig): Promise<string> {
        const { host, port, key } = config;
        const sshCommand = `ssh -i ${key} -p ${port}`;
        const command = `mkdir -p ~/.ssh && ssh-keyscan -p ${port} ${host} >> ~/.ssh/known_hosts && chmod 600 ${key}`;
        await Utils.runCommand(command, []);

        return sshCommand;
    }

    private async _createRemoteFolder(remoteFolder: string): Promise<void> {
        const createRemoteFolderCommand = `${this._sshCommand} ${this._config.user}@${this._config.host} "mkdir -p ${remoteFolder}"`;
        await Utils.runCommand(createRemoteFolderCommand, []);
    }

    private async _backupSource(localPath: string, remoteFolder: string): Promise<void> {
        const rsyncCommand = `rsync -e "${this._sshCommand}" ${this.rsyncPermOptions} -vrt --delete --no-links ${localPath} ${this._config.user}@${this._config.host}:${remoteFolder}`;
        await Utils.runCommand(rsyncCommand, []);
    }

    private _generateRemoteFolderName(prefix: string, source: ConfigJobSource): string {
        return `${prefix.replace(/\/$/, '')}/${source.name}/`;
    }

    public async getExistingBackups(): Promise<string[]> {
        try {
            const listCommand = `${this._sshCommand} ${this._config.user}@${this._config.host} "ls -1 ${this._job.destination.path}"`;
            const { stdout: list } = await Utils.runCommand(listCommand, []);
            return list
                .split('\n')
                .filter((item) => item.trim() !== '')
                .sort((a, b) => b.localeCompare(a))
                .map((item) => this._job.destination.path + '/' + item);
        } catch (error) {
            // Silently return empty array
            return [];
        }
    }

    private async _copyBackup(
        remoteFolderPrefix: string,
        existingBackupFolder: string,
        source: ConfigJobSource,
        remoteFolder: string,
    ): Promise<void> {
        const from = `${existingBackupFolder.replace(/\/$/, '')}/${source.name}`;
        const to = remoteFolder.replace(/\/$/, '');

        if (from === to) {
            return;
        }

        const createFolderCommand = `${this._sshCommand} ${this._config.user}@${this._config.host} "mkdir -p ${remoteFolderPrefix.replace(/\/$/, '')}"`;
        await Utils.runCommand(createFolderCommand, []);

        const copyCommand = `${this._sshCommand} ${this._config.user}@${this._config.host} "cp -r ${from} ${to}"`;
        await Utils.runCommand(copyCommand, []);
    }

    async cleanUpBackupFolder(retention: ConfigRetention): Promise<number> {
        const backups = await this.getExistingBackups();
        const backupFoldersToKeep = this._getBackupFoldersToKeep(retention);
        let removedBackups = 0;
        for (const backup of backups) {
            if (!this._shouldRetainBackup(backup, backupFoldersToKeep)) {
                const removeCommand = `${this._sshCommand} ${this._config.user}@${this._config.host} "rm -rf ${backup}"`;
                await Utils.runCommand(removeCommand, []);
                removedBackups++;
            }
        }

        return removedBackups;
    }

    private _shouldRetainBackup(backup: string, backupFoldersToKeep: string[]): boolean {
        // extract date from backup folder name (/path/to/backup/YYYY-MM-DD-HH-MM-SS)
        const date = backup.split('/').pop().split('-').slice(0, 3).join('-');
        return backupFoldersToKeep.includes(date);
    }

    private _getBackupFoldersToKeep(retention: ConfigRetention): string[] {
        const today = dayjs();

        const backupFolders = [];

        for (let i = 0; i < retention.keep_daily; i++) {
            const date = today.subtract(i, 'day');
            backupFolders.push(date.format('YYYY-MM-DD'));
        }

        for (let i = 0; i < retention.keep_weekly; i++) {
            const date = today.subtract(i, 'week').startOf('isoWeek');
            backupFolders.push(date.format('YYYY-MM-DD'));
        }

        for (let i = 0; i < retention.keep_monthly; i++) {
            const date = today.subtract(i, 'month').startOf('month');
            backupFolders.push(date.format('YYYY-MM-DD'));
        }

        return _.uniq(backupFolders);
    }

    public async downloadBackup(localFolder: string, backup: string): Promise<string> {
        const from = `${backup.replace(/\/$/, '')}/`;
        const to = `${localFolder.replace(/\/$/, '')}/${this._job.name}/${backup.split('/').pop()}/`;

        const { user, host } = this._config;

        Utils.runCommand(`mkdir -p ${to.replace(/\/$/, '')}`, []);
        const rsyncCommand = `rsync -e "${this._sshCommand}" ${this.rsyncPermOptions} -vrt --delete --no-links ${user}@${host}:${from} ${to}`;
        await Utils.runCommand(rsyncCommand, []);

        return to;
    }
}

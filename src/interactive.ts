import 'reflect-metadata';
import { BackupManager } from './backup-manager';
import { Utils } from './utils';
import { select, Separator } from '@inquirer/prompts';
import { confirm } from '@inquirer/prompts';

(async () => {
    Utils.headerTitle('Interactive Mode');

    try {
        const backupManager = await BackupManager.create();
        const jobNames = backupManager.getJobNames();
        const jobName = await select({
            message: 'Select a job',
            pageSize: 50,
            choices: [
                ...jobNames.map((name) => ({ name, value: name })),
                new Separator('---'),
                { name: '💾 Backup all jobs', value: 'backup-all' },
                { name: '🔔 Test notifications', value: 'test-notifications' },
                { name: '🏃 Exit', value: 'exit' },
            ],
        });
        console.log('');

        if (jobName === 'exit') {
            process.exit(0);
        }

        if (jobName === 'test-notifications') {
            await backupManager.testNotifications();
            process.exit(0);
        }

        if (jobName === 'backup-all') {
            // confirm
            const confirmBackupAll = await confirm({
                message: 'Are you sure you want to backup all jobs?',
                default: false,
            });
            console.log('');

            if (!confirmBackupAll) {
                process.exit(0);
            }

            await backupManager.backup();
            process.exit(0);
        }

        const job = backupManager.getJobByName(jobName);
        if (!job) {
            throw new Error(`Job \`${jobName}\` not found`);
        }

        const choice = await select({
            message: 'What do you want to do?',
            choices: [
                { name: 'List backups', value: 'list' },
                { name: 'Download backup', value: 'download' },
                { name: 'Execute a backup', value: 'execute' },
                new Separator('---'),
                { name: '🏃 Exit', value: 'exit' },
            ],
        });

        if (choice === 'exit') {
            process.exit(0);
        }

        if (choice === 'list' || choice === 'download') {
            const backups = await backupManager.getJobBackups(job);
            if (choice === 'list') {
                console.log('');
                for (const backup of backups) {
                    console.log('- ' + backup.split('/').pop());
                }
            }
            if (choice === 'download') {
                const backup = await select({
                    message: 'Select a backup',
                    loop: false,
                    pageSize: 10,
                    choices: [
                        { name: '🏃 Exit', value: 'exit' },
                        new Separator('---'),
                        ...backups.map((backup) => ({
                            name: backup.split('/').pop(),
                            value: backup,
                        })),
                    ],
                });
                console.log('');
                if (backup === 'exit') {
                    process.exit(0);
                }
                await backupManager.downloadBackup('/shared', job, backup);
            }
        }

        if (choice === 'execute') {
            await backupManager.processJob(job);
        }
    } catch (error) {
        console.log('');
        console.error(error instanceof Error ? error.toString() : String(error));
        console.log('');
        process.exit(1);
    }

    console.log('');
})();

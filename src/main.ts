import 'reflect-metadata';
import { BackupManager } from './backup-manager';
import { Utils } from './utils';

(async () => {
    Utils.headerTitle('Backup Manager');

    try {
        const backupManager = await BackupManager.create();
        await backupManager.backup();
    } catch (error) {
        console.log('');
        console.error(error instanceof Error ? error.toString() : String(error));
        console.log('');
        process.exit(1);
    }

    console.log('');
})();

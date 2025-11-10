import 'reflect-metadata';
import { BackupManager } from './backup-manager';

(async () => {
    const backupManager = new BackupManager();
    try {
        await backupManager.execute();
    } catch (error) {
        console.log('');
        console.error(error instanceof Error ? error.toString() : String(error));
        console.log('');
        process.exit(1);
    }

    console.log('');
})();

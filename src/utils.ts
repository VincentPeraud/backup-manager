import { validateOrReject, ValidationError } from 'class-validator';
import figlet from 'figlet';
import { parse } from 'yaml';
import { Config } from './config.interface';
import { plainToInstance } from 'class-transformer';
import fs from 'fs';
import { spawn } from 'child_process';

export class Utils {
    static async parseAndValidateConfig(configFilePath: string): Promise<Config> {
        const parsedConfig = parse(fs.readFileSync(configFilePath, 'utf8'));
        const config = plainToInstance(Config, parsedConfig);
        try {
            await validateOrReject(config, {
                skipMissingProperties: false,
                skipUndefinedProperties: false,
                skipNullProperties: false,
            });
        } catch (err) {
            if (Array.isArray(err)) {
                const messages = Utils.formatValidationErrors(err);
                throw new Error(messages.join('\n'));
            } else {
                throw new Error(err.toString());
            }
        }

        return config;
    }

    static formatValidationErrors(errors: ValidationError[], parentPath = ''): string[] {
        const messages: string[] = [];

        errors.forEach((error) => {
            const currentPath = parentPath ? `${parentPath}.${error.property}` : error.property;

            if (error.constraints) {
                Object.values(error.constraints).forEach((msg) => {
                    messages.push(`${currentPath}: ${msg}`);
                });
            }

            if (error.children?.length) {
                messages.push(...Utils.formatValidationErrors(error.children, currentPath));
            }
        });

        return messages;
    }

    static headerTitle(title: string): void {
        console.log('');
        console.log('');
        console.log(
            figlet.textSync(title, {
                font: 'Pagga',
                horizontalLayout: 'fitted',
                verticalLayout: 'fitted',
                width: 160,
                whitespaceBreak: true,
            }),
        );
        console.log('');
        console.log('');
    }

    static async runCommand(
        command: string,
        args: string[],
        cwd = '.',
        showOutput = false,
    ): Promise<{ stdout: string; stderr: string }> {
        return new Promise((resolve, reject) => {
            const child = spawn(command, args, {
                cwd,
                env: process.env,
                shell: true,
            });

            let stdout = '';
            let stderr = '';

            child.stdout.on('data', (chunk) => {
                const text = chunk.toString();
                if (showOutput) {
                    process.stdout.write(text);
                }
                stdout += text;
            });
            child.stderr.on('data', (chunk) => {
                const text = chunk.toString();
                if (showOutput) {
                    process.stderr.write(text);
                }
                stderr += text;
            });

            child.on('error', reject);

            child.on('close', (code) => {
                // console.log('stdout', stdout);
                // console.log('stderr', stderr);
                if (code === 0) {
                    resolve({ stdout, stderr });
                } else {
                    reject(
                        new Error(
                            `Command "${command} ${args.join(' ')}" exited with code ${code}\nstdout: ${stdout}\nstderr: ${stderr}`,
                        ),
                    );
                }
            });
        });
    }

    static slugify(text: string): string {
        return (
            text
                .normalize('NFD')
                .replace(/\p{Diacritic}/gu, '')
                .toLowerCase()
                .replace(/[^a-z0-9]+/g, '-')
                .replace(/^-+|-+$/g, '') || 'untitled'
        );
    }
}

import { Type } from 'class-transformer';
import {
    IsArray,
    IsDefined,
    IsIn,
    IsNotEmpty,
    IsNumber,
    IsOptional,
    IsString,
    ValidateNested,
} from 'class-validator';

export class Config {
    @IsDefined()
    @ValidateNested()
    @Type(() => ConfigSettings)
    settings: ConfigSettings;

    @IsDefined()
    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ConfigJob)
    jobs: ConfigJob[];

    @IsDefined()
    @ValidateNested()
    @Type(() => ConfigNotifications)
    notifications: ConfigNotifications;
}

export class ConfigRetention {
    @IsNumber()
    keep_daily: number;

    @IsNumber()
    keep_weekly: number;

    @IsNumber()
    keep_monthly: number;
}

abstract class DestinationConfig {
    @IsString()
    @IsNotEmpty()
    name: string;

    @IsString()
    @IsIn(['rsync', 's3'])
    type: 'rsync' | 's3';
}

export class S3Config extends DestinationConfig {
    @IsString()
    bucket: string;

    @IsString()
    region: string;
}

export class RsyncConfig extends DestinationConfig {
    @IsString()
    user: string;

    @IsString()
    host: string;

    @IsNumber()
    port: number;

    @IsString()
    key: string;
}

class ConfigSettings {
    @IsString()
    server_name: string;

    @ValidateNested()
    @IsDefined()
    @Type(() => ConfigRetention)
    retention: ConfigRetention;

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => DestinationConfig, {
        discriminator: {
            property: 'type',
            subTypes: [
                { name: 'rsync', value: RsyncConfig },
                { name: 's3', value: S3Config },
            ],
        },
        keepDiscriminatorProperty: true,
    })
    destinations: DestinationConfig[];
}

export class ConfigJob {
    @IsString()
    name: string;

    @ValidateNested()
    @IsDefined()
    @Type(() => ConfigJobDestination)
    destination: ConfigJobDestination;

    @IsArray()
    @IsOptional()
    pre_commands?: string[];

    @IsArray()
    @ValidateNested({ each: true })
    @Type(() => ConfigJobSource)
    sources: ConfigJobSource[];
}

class ConfigJobDestination {
    @IsString()
    name: string;

    @IsString()
    path: string;
}

export class ConfigJobSource {
    @IsString()
    @IsIn(['file', 'folder'])
    type: 'file' | 'folder';

    @IsString()
    name: string;

    @IsString()
    path: string;
}

class ConfigNotifications {
    @IsArray()
    @IsString({ each: true })
    @IsIn(['mattermost', 'slack'], {
        each: true,
        message: ({ value }) => `Invalid notification type: ${value}`,
    })
    @IsOptional()
    on_success?: Array<'mattermost' | 'slack'>;

    @IsArray()
    @IsString({ each: true })
    @IsIn(['mattermost', 'slack'], {
        each: true,
        message: ({ value }) => `Invalid notification type: ${value}`,
    })
    @IsOptional()
    on_failure?: Array<'mattermost' | 'slack'>;

    @ValidateNested()
    @Type(() => MattermostConfig)
    mattermost?: MattermostConfig;

    @ValidateNested()
    @Type(() => SlackConfig)
    slack?: SlackConfig;
}

export class MattermostConfig {
    @IsString()
    bot_token: string;

    @IsString()
    channel_id: string;

    @IsString()
    server_url: string;
}

class SlackConfig {
    @IsString()
    bot_token: string;

    @IsString()
    channel_id: string;
}

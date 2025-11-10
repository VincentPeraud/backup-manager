import { MattermostConfig } from './config.interface';

export class Mattermost {
    /**
     * Send a message to a Mattermost channel
     *
     * @param config Mattermost configuration
     * @param message Message to send
     * @param root_id Root ID of the message to reply to (optional)
     *
     * @returns Post ID of the sent message
     */
    public static async send(
        config: MattermostConfig,
        message: string,
        root_id?: string,
    ): Promise<string> {
        const endpoint = config.server_url.replace(/\/$/, '') + '/api/v4/posts';
        const body = {
            channel_id: config.channel_id,
            ...(root_id ? { root_id } : {}),
            message,
        };
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${config.bot_token}`,
            },
            body: JSON.stringify(body),
        });

        if (!response.ok) {
            throw new Error(`Failed to send Mattermost message: ${response.statusText}`);
        }

        const data = await response.json();
        return data.id;
    }
}

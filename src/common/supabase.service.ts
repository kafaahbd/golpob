import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

@Injectable()
export class SupabaseService {
  private client: SupabaseClient;
  private bucket: string;
  private readonly logger = new Logger(SupabaseService.name);

  constructor(private config: ConfigService) {
    this.client = createClient(
      config.get('SUPABASE_URL'),
      config.get('SUPABASE_SERVICE_KEY'),
    );
    this.bucket = config.get('SUPABASE_BUCKET', 'golpo-media');
  }

  async uploadAvatar(userId: string, file: Express.Multer.File): Promise<string> {
    const ext = file.mimetype.split('/')[1];
    const path = `avatars/${userId}.${ext}`;
    return this.upload(path, file.buffer, file.mimetype);
  }

  async uploadImage(chatId: string, file: Express.Multer.File): Promise<string> {
    const ext = file.mimetype.split('/')[1];
    const path = `chats/${chatId}/images/${Date.now()}.${ext}`;
    return this.upload(path, file.buffer, file.mimetype);
  }

  async uploadVoice(chatId: string, buffer: Buffer): Promise<string> {
    const path = `chats/${chatId}/voice/${Date.now()}.webm`;
    return this.upload(path, buffer, 'audio/webm');
  }

  async uploadGroupAvatar(groupId: string, file: Express.Multer.File): Promise<string> {
    const ext = file.mimetype.split('/')[1];
    const path = `groups/${groupId}.${ext}`;
    return this.upload(path, file.buffer, file.mimetype);
  }

  private async upload(path: string, data: Buffer, contentType: string): Promise<string> {
    const { error } = await this.client.storage
      .from(this.bucket)
      .upload(path, data, { contentType, upsert: true });

    if (error) {
      this.logger.error(`Upload failed: ${error.message}`);
      throw new Error(`Storage upload failed: ${error.message}`);
    }

    const { data: urlData } = this.client.storage.from(this.bucket).getPublicUrl(path);
    return urlData.publicUrl;
  }

  async getSignedUrl(path: string, expiresInSeconds = 3600): Promise<string> {
    const { data, error } = await this.client.storage
      .from(this.bucket)
      .createSignedUrl(path, expiresInSeconds);
    if (error) throw new Error(error.message);
    return data.signedUrl;
  }

  async delete(path: string): Promise<void> {
    await this.client.storage.from(this.bucket).remove([path]);
  }
}

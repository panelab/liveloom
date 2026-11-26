import { z } from 'zod'
import { PLATFORMS, isValidServerUrl, type PlatformId } from '@sp/shared'

export const platformIds = Object.keys(PLATFORMS) as [PlatformId, ...PlatformId[]]

export const serverUrlSchema = z.string().trim().refine(isValidServerUrl, 'Must start with rtmp:// or rtmps://')
export const streamKeySchema = z.string().trim().min(4, 'Stream key looks too short').max(512)

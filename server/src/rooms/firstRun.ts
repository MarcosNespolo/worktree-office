import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { readConfig, writeConfig } from '../configPersistence.js';
import { CONFIG_FILE_NAME, LAYOUT_FILE_DIR } from '../constants.js';
import { FIRST_RUN_SETTINGS } from './constants.js';

export function applyFirstRunSettings(): void {
  if (fs.existsSync(path.join(os.homedir(), LAYOUT_FILE_DIR, CONFIG_FILE_NAME))) return;
  const config = readConfig();
  const version = (process.env.PIXEL_AGENTS_VERSION ?? '').split('.').slice(0, 2).join('.');
  Object.assign(config.standalone, FIRST_RUN_SETTINGS, { lastSeenVersion: version });
  writeConfig(config);
}

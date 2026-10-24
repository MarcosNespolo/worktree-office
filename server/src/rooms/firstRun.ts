import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { readConfig, writeConfig } from '../configPersistence.js';
import { CONFIG_FILE_NAME, LAYOUT_FILE_DIR } from '../constants.js';
import { FIRST_RUN_SETTINGS } from './constants.js';

export function applyFirstRunSettings(): void {
  if (fs.existsSync(path.join(os.homedir(), LAYOUT_FILE_DIR, CONFIG_FILE_NAME))) return;
  const config = readConfig();
  Object.assign(config.standalone, FIRST_RUN_SETTINGS);
  writeConfig(config);
}

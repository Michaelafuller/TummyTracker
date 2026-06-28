// This file is required for Expo/React Native SQLite migrations - https://orm.drizzle.team/quick-sqlite/expo

import journal from './meta/_journal.json';
import m0000 from './0000_skinny_purifiers.sql';
import m0001 from './0001_adorable_ben_grimm.sql';
import m0002 from './0002_magical_lorna_dane.sql';
import m0003 from './0003_supreme_vengeance.sql';

  export default {
    journal,
    migrations: {
      m0000,
m0001,
m0002,
m0003
    }
  }
  
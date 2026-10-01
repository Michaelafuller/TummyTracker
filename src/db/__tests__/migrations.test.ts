import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';

// Guards the Phase 2 promise that the migration preserves existing entries: the
// bowel_movement migration must be additive (ALTER TABLE ... ADD COLUMN), never a
// destructive table rebuild that could drop pre-existing rows.
const MIGRATIONS_DIR = join(__dirname, '..', 'migrations');

function readMigration(prefix: string): string {
  const file = readdirSync(MIGRATIONS_DIR).find((f) => f.startsWith(prefix) && f.endsWith('.sql'));
  if (!file) throw new Error(`No migration starting with ${prefix}`);
  return readFileSync(join(MIGRATIONS_DIR, file), 'utf8');
}

describe('migrations', () => {
  it('0000 creates the log_entry table', () => {
    expect(readMigration('0000')).toMatch(/create table `log_entry`/i);
  });

  it('0001 adds bristol_scale additively without dropping data', () => {
    const sql = readMigration('0001');
    expect(sql).toMatch(/alter table `log_entry` add `bristol_scale`/i);
    expect(sql).not.toMatch(/drop table/i);
    expect(sql).not.toMatch(/create table `log_entry`/i);
  });

  it('0002 adds saturated_fat_g additively without dropping data', () => {
    const sql = readMigration('0002');
    expect(sql).toMatch(/alter table `log_entry` add `saturated_fat_g`/i);
    expect(sql).not.toMatch(/drop table/i);
    expect(sql).not.toMatch(/create table `log_entry`/i);
  });

  it('0003 adds ingredients_text and tags_json additively without dropping data', () => {
    const sql = readMigration('0003');
    expect(sql).toMatch(/alter table `log_entry` add `ingredients_text`/i);
    expect(sql).toMatch(/alter table `log_entry` add `tags_json`/i);
    expect(sql).not.toMatch(/drop table/i);
    expect(sql).not.toMatch(/create table `log_entry`/i);
  });

  it('0004 adds symptom_type and severity additively without dropping data', () => {
    const sql = readMigration('0004');
    expect(sql).toMatch(/alter table `log_entry` add `symptom_type`/i);
    expect(sql).toMatch(/alter table `log_entry` add `severity`/i);
    expect(sql).not.toMatch(/drop table/i);
    expect(sql).not.toMatch(/create table `log_entry`/i);
  });

  it('0006 adds the meal_component table and component_count additively without dropping data', () => {
    const sql = readMigration('0006');
    expect(sql).toMatch(/create table `meal_component`/i);
    expect(sql).toMatch(/alter table `log_entry` add `component_count`/i);
    expect(sql).not.toMatch(/drop table/i);
    expect(sql).not.toMatch(/create table `log_entry`/i);
  });

  it('0009 creates the medication, medication_event, and medication_dose tables additively without dropping data', () => {
    const sql = readMigration('0009');
    expect(sql).toMatch(/create table `medication`/i);
    expect(sql).toMatch(/create table `medication_event`/i);
    expect(sql).toMatch(/create table `medication_dose`/i);
    expect(sql).not.toMatch(/drop table/i);
    expect(sql).not.toMatch(/alter table `log_entry`/i);
  });

  it('0011 creates the experiment table additively, touching no existing table (GitHub #19)', () => {
    const sql = readMigration('0011');
    expect(sql).toMatch(/create table `experiment`/i);
    expect(sql).not.toMatch(/drop table/i);
    expect(sql).not.toMatch(/alter table/i);
  });

  it('0012 creates the day_factor table and its unique date index, touching no existing table (GitHub #23)', () => {
    const sql = readMigration('0012');
    expect(sql).toMatch(/create table `day_factor`/i);
    expect(sql).toMatch(/create unique index `day_factor_date_unique`/i);
    expect(sql).not.toMatch(/drop table/i);
    expect(sql).not.toMatch(/alter table/i);
  });

  it('0013 creates the saved_meal tables and indexes only, touching no existing table (GitHub #25)', () => {
    const sql = readMigration('0013');
    expect(sql).toMatch(/create table `saved_meal`/i);
    expect(sql).toMatch(/create table `saved_meal_component`/i);
    expect(sql).toMatch(/create unique index `saved_meal_name_key_unique`/i);
    expect(sql).toMatch(/create index `saved_meal_component_saved_meal_id_idx`/i);
    expect(sql).not.toMatch(/drop table/i);
    expect(sql).not.toMatch(/alter table/i);
  });
});

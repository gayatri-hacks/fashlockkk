-- Allows generated editorial concept images for main trend-card covers.
-- Safe additive migration: no rows are deleted or overwritten.

alter table generated_fashion_images
  drop constraint if exists generated_fashion_images_variant_check;

alter table generated_fashion_images
  add constraint generated_fashion_images_variant_check
  check (variant in ('trend_concept', 'trend_hero', 'trend_women', 'trend_men', 'deep_dive', 'daily_edit'))
  not valid;

alter table generated_fashion_images
  validate constraint generated_fashion_images_variant_check;

alter table image_generation_jobs
  drop constraint if exists image_generation_jobs_variant_check;

alter table image_generation_jobs
  add constraint image_generation_jobs_variant_check
  check (variant in ('trend_concept', 'trend_hero', 'trend_women', 'trend_men', 'deep_dive', 'daily_edit'))
  not valid;

alter table image_generation_jobs
  validate constraint image_generation_jobs_variant_check;

-- Product marker for the packaged native schema upgrade. Application startup
-- never executes DDL. Drain Web capture/schedulers and Workers before db:migrate.
SELECT 1;

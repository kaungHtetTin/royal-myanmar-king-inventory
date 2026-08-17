<?php

return [
    'release' => [
        'version' => env('APP_VERSION'),
        'deployment_id' => env('DEPLOYMENT_ID'),
    ],
    'contacts' => [
        'business_owner' => env('BUSINESS_OWNER_CONTACT'),
        'technical_owner' => env('TECHNICAL_OWNER_CONTACT'),
        'security' => env('SECURITY_CONTACT'),
        'incident_primary' => env('INCIDENT_PRIMARY_CONTACT'),
        'incident_escalation' => env('INCIDENT_ESCALATION_CONTACT'),
        'database_recovery_owner' => env('DATABASE_RECOVERY_OWNER'),
    ],
    'backup' => [
        'directory' => env('BACKUP_DIRECTORY', storage_path('app/private/backups')),
        'maximum_age_hours' => (int) env('BACKUP_MAXIMUM_AGE_HOURS', 26),
        'retention_days' => (int) env('BACKUP_RETENTION_DAYS', 30),
        'offsite_destination' => env('BACKUP_OFFSITE_DESTINATION'),
    ],
    'pilot' => [
        'warehouse_code' => env('PILOT_WAREHOUSE_CODE'),
        'representative_code' => env('PILOT_REPRESENTATIVE_CODE'),
    ],
    'signoff_evidence_path' => env('ROLLOUT_SIGNOFF_EVIDENCE', storage_path('app/private/rollout/phase9-signoff.json')),
];

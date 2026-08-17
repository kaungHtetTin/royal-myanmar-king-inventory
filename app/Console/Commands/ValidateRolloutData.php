<?php

namespace App\Console\Commands;

use App\Services\MasterDataTemplateValidator;
use Illuminate\Console\Command;

class ValidateRolloutData extends Command
{
    protected $signature = 'inventory:validate-rollout-data
        {directory=resources/import-templates : Directory containing the seven rollout CSV files}
        {--allow-existing : Permit identifiers already present during an intentional re-validation}
        {--json : Emit machine-readable output}';

    protected $description = 'Validate initial master-data and opening-stock CSV files without changing the database';

    public function __construct(private readonly MasterDataTemplateValidator $validator)
    {
        parent::__construct();
    }

    public function handle(): int
    {
        $directory = (string) $this->argument('directory');
        if (preg_match('~^(?:[A-Za-z]:[\\\\/]|/)~', $directory) !== 1) {
            $directory = base_path($directory);
        }
        $result = $this->validator->validate($directory, (bool) $this->option('allow-existing'));

        if ($this->option('json')) {
            $this->line(json_encode($result, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES));
        } else {
            $this->table(['File', 'Rows'], collect($result['files'])->map(fn ($rows, $file) => [$file, $rows])->values()->all());
            foreach ($result['errors'] as $error) {
                $this->error($error);
            }
            $this->line($result['valid'] ? '<info>Rollout data is valid; no database changes were made.</info>' : '<error>Rollout data validation failed.</error>');
        }

        return $result['valid'] ? self::SUCCESS : self::FAILURE;
    }
}

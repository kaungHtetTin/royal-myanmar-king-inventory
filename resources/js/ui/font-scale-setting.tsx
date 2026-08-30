import { useLocale } from '../localization/locale-context';
import { useUiPreferences } from './preferences';

export function FontScaleSetting() {
    const { t } = useLocale();
    const { fontScale, fontScalePercent, setFontScalePercent } = useUiPreferences();
    const multiplier = fontScale.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');

    return (
        <section className="font-scale-setting" aria-labelledby="font-scale-title">
            <header>
                <div>
                    <strong id="font-scale-title">{t('Application font size')}</strong>
                    <small>{t('Saved only on this device and applied to both applications.')}</small>
                </div>
                <output aria-live="polite">
                    <strong>{fontScalePercent}%</strong>
                    <small>{multiplier}×</small>
                </output>
            </header>
            <div className="font-scale-setting__slider">
                <input
                    aria-label={t('Application font size')}
                    max={100}
                    min={0}
                    onChange={(event) => setFontScalePercent(Number(event.target.value))}
                    step={1}
                    type="range"
                    value={fontScalePercent}
                />
                <div aria-hidden="true">
                    <span>{t('Default')} · 0%</span>
                    <span>100% · 1.5×</span>
                </div>
            </div>
        </section>
    );
}

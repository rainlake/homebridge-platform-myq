import { Characteristic } from 'hap-nodejs';

export class LastUpdate extends Characteristic {

    constructor() {
        super('Last Activity', '2837B590-D1BA-11E5-A837-0800200C9A66', {
            format: Characteristic.Formats.STRING,
            perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY],
            unit: Characteristic.Units.SECONDS,
            minStep: 0,
            minValue: 0,
            maxValue: 0
        });
    }
}

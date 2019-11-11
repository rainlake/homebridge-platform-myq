import { Characteristic } from 'hap-nodejs';
import { Logger } from "./logger";
import { MyQDevice, MyQAPI } from "./myqapi";

export class MyQAccessory {
    protected service: any;
    protected name: string;
    protected refreshTimer: any;
    protected static readonly REFRESH_STATE_TIMEOUT = 5;

    constructor(protected logger: Logger, protected device: MyQDevice, protected api: MyQAPI, protected Service: any, protected Characteristic: any)
    {
        this.name = device.name;
    }
    public getServices() {
        var service = new this.Service.AccessoryInformation(null, null);
        service.setCharacteristic(Characteristic.Name, this.device.name)
        .setCharacteristic(Characteristic.Manufacturer, 'MyQ')
        .setCharacteristic(Characteristic.Model, 'MyQ')
        .setCharacteristic(Characteristic.SerialNumber, this.device.serial_number || '');
        return [ service, this.service];
    }

}
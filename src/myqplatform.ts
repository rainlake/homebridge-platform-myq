import { Logger } from "./logger";
import { MyQAPI, MyQDevice } from "./myqapi";
import { MyQGarageDoor } from "./myqgaragedoor";
import { HomeBridge } from "./homebridge";

export class MyQPlatform {
    host: string;
    appId: string;
    refreshInterval: number;
    userAgent: string;

    api: MyQAPI;
    devices: Array<MyQDevice>;

    constructor(private logger: Logger, private config: any, private homebridge: HomeBridge)
    {
        if(config.brand !== 'Craftsman') {
            this.host = 'https://api.myqdevice.com';
            this.appId = 'Vj8pQggXLhLy0WHahglCD4N1nAkkXQtGYpq2HrHD7H1nvmbT55KqtN6RSF4ILB/i';
        } else {
            this.host = 'https://craftexternal.myqdevice.com';
            this.appId = 'OA9I/hgmPHFp9RYKJqCKfwnhh28uqLJzZ9KOJf1DXoo8N2XAaVX6A1wcLYyWsnnv';
        }
        if(config.appId) {
            this.appId = config.appId;
        }
        this.refreshInterval = 30 * 1000;
        this.userAgent = 'Galaxy/Android 9.1.0';
        this.api = new MyQAPI(logger, this.host, this.userAgent, this.appId, config.user, config.pass);
    }
    public async accessories(callback : Function): Promise<any>
    {
        //await this.api.login();
        await this.api.getAccount();
        this.devices = await this.api.getDevices();
        callback(
            this.devices
            .filter(device => ['garagedooropener'].some(device_type => device_type == device.device_type))
            .map(device => new MyQGarageDoor(this.logger, device, this.api, this.homebridge.hap.Service, this.homebridge.hap.Characteristic)));
    }
}
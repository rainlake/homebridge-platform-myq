import * as rp from 'request-promise';
import { Logger } from "./logger";
export interface MyQDevice {
    href: string;
    serial_number: string;
    device_family: string;
    device_platform: string;
    device_type: string;
    name: string;
    parent_device: string;
    parent_device_id: string;
    created_date: string;
    state: any;
}
export class MyQAPI {
    private securityToken: string;
    private accountId: string;
    public lastActiveTime: number;
    constructor(private logger: Logger,
        private host: string,
        private userAgent: string,
        private appId: string,
        private userName: string,
        private password: string)
    {}
    public async login(): Promise<void> {
        if(Date.now() - this.lastActiveTime < 5000) {
            return;
        }
        this.securityToken = '';
        this.logger.info("Trying to get new token");
        const res = await rp.post({
            uri: this.host + '/api/v5/login',
            method: 'POST',
            headers: {
                'User-Agent': this.userAgent,
                'MyQApplicationId': this.appId,
                'Culture': 'en-us',
                'BrandId': '1'
            },
            json: {
                UserName: this.userName,
                Password : this.password
            }
        });

        if(res.SecurityToken) {
            this.securityToken = res.SecurityToken;
            this.lastActiveTime = Date.now();
            this.logger.info(`MyQ login ok, security token is ${this.securityToken}`);
        }
    }
    public async getAccount() : Promise<void> {
        if(!this.securityToken) {
            await this.login();
        }
        try {
            const res = await rp.get({
                uri: this.host + '/api/v5/my',
                json: true,
                headers: {
                    'SecurityToken': this.securityToken,
                    'User-Agent': this.userAgent,
                    'MyQApplicationId': this.appId,
                    'Culture': 'en-us',
                    'BrandId': '1'
                }
            });
            this.accountId = res.UserId;
            this.lastActiveTime = Date.now();
        } catch(e) {
            if(e.name == 'StatusCodeError' && e.statusCode == 401) {
                this.securityToken = null;
            }
        }
    }
    public async getDevices() : Promise<Array<MyQDevice>> {
        if(!this.securityToken) {
            await this.login();
        }
        try {
            const res = await rp.get({
                uri: this.host + `/api/v5.1/Accounts/${this.accountId}/Devices`,
                json: true,
                headers: {
                    'SecurityToken': this.securityToken,
                    'User-Agent': this.userAgent,
                    'MyQApplicationId': this.appId,
                    'Culture': 'en-us',
                    'BrandId': '1'
                }
            });
            this.lastActiveTime = Date.now();
            return (res.items || []);
        } catch(e) {
            if(e.name == 'StatusCodeError' && e.statusCode == 401) {
                this.securityToken = null;
            }
            return [];
        }
    }
    public async getDevice(device_id: string) : Promise<MyQDevice> {
        if(!this.securityToken) {
            await this.login();
        }
        try {
            const res = await rp.get({
                uri: this.host + `/api/v5.1/Accounts/${this.accountId}/Devices/${device_id}`,
                json: true,
                headers: {
                    'SecurityToken': this.securityToken,
                    'User-Agent': this.userAgent,
                    'MyQApplicationId': this.appId,
                    'Culture': 'en-us',
                    'BrandId': '1'
                }
            });
            this.lastActiveTime = Date.now();
            return res;
        } catch(e) {
            if(e.name == 'StatusCodeError' && e.statusCode == 401) {
                this.securityToken = null;
            }
            return null;
        }
    }
    public async setDeviceState(device_id: string, action_type: string): Promise<void> {
        if(!this.securityToken) {
            await this.login();
        }
        try {
            const res = await rp.put({
                uri: `${this.host}/api/v5.1/Accounts/${this.accountId}/Devices/${device_id}/actions`,
                json: {
                    action_type
                },
                headers: {
                    'SecurityToken': this.securityToken,
                    'User-Agent': this.userAgent,
                    'MyQApplicationId': this.appId,
                    'Culture': 'en-us',
                    'BrandId': '1'
                }
            });
            this.lastActiveTime = Date.now();
        } catch(e) {
            if(e.name == 'StatusCodeError' && e.statusCode == 401) {
                this.securityToken = null;
            }
        }
    }
}
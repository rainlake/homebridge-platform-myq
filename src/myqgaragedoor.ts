import { MyQAccessory } from './myqaccessory';
import { Logger } from './logger';
import { MyQDevice, MyQAPI } from './myqapi';
export class MyQGarageDoor extends MyQAccessory {
    constructor(logger: Logger, device: MyQDevice, api: MyQAPI,Service: any, Characteristic: any)
    {
        super(logger, device, api, Service, Characteristic);
        this.service = new Service.GarageDoorOpener(device.name, null);
        this.service.getCharacteristic(Characteristic.CurrentDoorState).on('get', this.onGetCurrentDoorState.bind(this));
        this.service.getCharacteristic(Characteristic.TargetDoorState).on('get', this.onGetTargetDoorState.bind(this));
        this.service.getCharacteristic(Characteristic.TargetDoorState).on('set', this.onSetTargetDoorState.bind(this));

        this.onGetCurrentDoorState((_, state:number) => this.service.getCharacteristic(Characteristic.CurrentDoorState).value = state);
        this.onGetTargetDoorState((_, state: number) => this.service.getCharacteristic(Characteristic.TargetDoorState).value = state);
    }
    private toHomeKitDoorState(state: string) {
        switch(state) {
            case 'closed':
                return this.Characteristic.CurrentDoorState.CLOSED;
            case 'open':
                return this.Characteristic.CurrentDoorState.OPEN;
            case 'opening':
                return this.Characteristic.CurrentDoorState.OPENING;
            case 'closing':
                return this.Characteristic.CurrentDoorState.CLOSING;
            case 'stopped':
                return this.Characteristic.CurrentDoorState.STOPPED;
            default:
                return this.Characteristic.CurrentDoorState.CLOSED;
        }
    }

    private async onGetCurrentDoorState(callback: Function): Promise<void> {
        await this.api.login();
        this.device = await this.api.getDevice(this.device.serial_number);
        const state = this.device.state.door_state;
        const hkState = this.toHomeKitDoorState(state);
        this.logger.info(`Homekit is requesting door state. current value is [${state}], [${hkState}]`);
        callback(null, hkState);
        this.refreshState();
    }
    private async onGetTargetDoorState(callback: Function): Promise<void> {
        const state = this.device.state.door_state;
        if(state == 'closed' || state == 'closing') {
            callback(null, this.Characteristic.TargetDoorState.CLOSED);
        } else {
            callback(null, this.Characteristic.TargetDoorState.OPEN);
        }
        this.refreshState();
    }
    private async onSetTargetDoorState(state: number, callback: Function): Promise<void> {
        this.logger.info(`Homekit is set door state. to [${state}]`);
        await this.api.login();
        switch(state) {
            case this.Characteristic.TargetDoorState.OPEN:
                await this.api.setDeviceState(this.device.serial_number, 'open');
                break;
            case this.Characteristic.TargetDoorState.CLOSED:
                await this.api.setDeviceState(this.device.serial_number, 'close');
                break;
        }
        callback(null);
        this.refreshState();
    }
    protected refreshState() {
        if(this.refreshTimer) {
            clearTimeout(this.refreshTimer);
        }
        let timeout = 120000;
        if(Date.now() -  Date.parse(this.device.state.last_update) < 60000) {
            timeout = MyQAccessory.REFRESH_STATE_TIMEOUT * 1000;
        }
        this.logger.info('setup timer refresh state.');
        this.refreshTimer = setTimeout(async () => {
            this.refreshTimer = null;
            this.logger.info('refreshing state.');
            const new_device = await this.api.getDevice(this.device.serial_number);
            console.log(new_device);
            if(new_device.state && new_device.state.door_state !== this.device.state.door_state) {
                this.service.getCharacteristic(this.Characteristic.CurrentDoorState)
                    .setValue(this.toHomeKitDoorState(new_device.state.door_state));
                this.device.state = new_device.state;

                const state = this.device.state.door_state;
                if(state == 'closed' || state == 'closing') {
                    this.service.getCharacteristic(this.Characteristic.TargetDoorState)
                    .setValue(this.Characteristic.TargetDoorState.CLOSED);
                } else {
                    this.service.getCharacteristic(this.Characteristic.TargetDoorState)
                    .setValue(this.Characteristic.TargetDoorState.OPEN);
                }
            }
            this.refreshState();
        }, timeout);
    }
}
import { MyQPlatform } from './myqplatform';
import { Characteristic } from 'hap-nodejs';
import { HomeBridge } from './homebridge';
export class LastUpdate extends Characteristic {

}

export default function (homebridge: HomeBridge) {
    homebridge.registerPlatform("homebridge-platform-myq", "MyQ", MyQPlatform);
}

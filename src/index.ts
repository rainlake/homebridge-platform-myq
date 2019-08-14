import * as request from "request-promise-native";

import { Characteristic } from 'hap-nodejs';
export class LastUpdate extends Characteristic {

}

export default function (homebridge: any) {
    var Characteristic = homebridge.hap.Characteristic;
    console.log(homebridge.hap.Characteristic);
}
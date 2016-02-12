var request = require("request");
var moment = require('moment');
var Service, Characteristic, LastUpdate;

module.exports = function(homebridge) {
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    homebridge.registerPlatform("homebridge-platform-myq", "MyQ", MyQPlatform);
    
    LastUpdate = function() {
        Characteristic.call(this, 'Last Update', '2837B590-D1BA-11E5-A837-0800200C9A66');

        this.setProps({
            format: Characteristic.Formats.STRING,
            perms: [Characteristic.Perms.READ, Characteristic.Perms.NOTIFY]
        });

        this.value = this.getDefaultValue();
    };
    require('util').inherits(LastUpdate, Characteristic);
}

function MyQPlatform(log, config) {
    var self = this;
    self.config = config;
    self.log = log;
    if(config.brand !== 'Craftsman') {
        self.host = 'https://myqexternal.myqdevice.com';
        self.appId = 'OA9I/hgmPHFp9RYKJqCKfwnhh28uqLJzZ9KOJf1DXoo8N2XAaVX6A1wcLYyWsnnv';
    } else {
        self.host = 'https://craftexternal.myqdevice.com';
        self.appId = 'NWknvuBd7LoFHfXmKNMBcgajXtZEgKUh4V7WNzMidrpUUluDpVYVZx+xT4PCM5Kx';
    }
    self.userAgent = config.brand + '/3.4 (iPhone; iOS 9.2.1; Scale/2.00)';
}
MyQPlatform.prototype.login = function(onSuccess, onFail) {
    var self = this;
    request.post({
        url : self.host + '/api/v4/User/Validate',
        headers: {
            'User-Agent': self.userAgent,
            'MyQApplicationId': self.appId/*,
            'BrandId': self.brandId*/
        },
        json: {
            username: self.config['user'],
            password : self.config['pass']
        }
    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            if (body.ReturnCode !== '0') {
                if(onFail) {
                    onFail.call(self, body.ReturnCode, body.ErrorMessage);
                }
            } else if(onSuccess) {
                self.SecurityToken = body.SecurityToken;
                self.log('SecurityToken: [%s]', self.SecurityToken);
                self.getuser.call(self, onSuccess);
            }
        }
        else {
            self.log("Error getting state (status code %s): %s", response.statusCode, err);
        }
    });
}
MyQPlatform.prototype.getuser = function(onSuccess) {
    var self = this;
    request.get({
        url : self.host + '/api/v4/user/getuser',
        headers: {
            'User-Agent': self.userAgent,
            'MyQApplicationId': self.appId,
            'SecurityToken': self.SecurityToken
        }
    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var json = JSON.parse(body);
            if (json.ReturnCode === '0' && onSuccess) {
                self.BrandId = json.BrandId;
                self.BrandName = json.BrandName;
                self.log('BrandId:[%s]', self.BrandId);
                self.log('BrandName:[%s]', self.BrandName);
                onSuccess.call(self);
            } 
        }
        else {
            self.log("Error getting state (status code %s): %s", response.statusCode, err);
        }
    });
}

MyQPlatform.prototype.getDevices = function(onSuccess, onFail) {
    var self = this;
    if(!self.SecurityToken && onFail) {
        onFail.call(self);
        return;
    }
    request.get({
        url : self.host + '/api/v4/userdevicedetails/get',
        headers : {
            'User-Agent': self.userAgent,
            'MyQApplicationId': self.appId,
            'BrandId': self.BrandId,
            'SecurityToken': self.SecurityToken
        }
    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            var json = JSON.parse(body);
            if(json.ReturnCode === '0' && json.Devices && json.Devices.length > 0) {
                var door_devices = [];
                var light_devices = [];
                var gateway_devices = [];
                json.Devices.forEach(function(device) {
                    if(device.MyQDeviceTypeId === 2 /*garage door*/
                        || device.MyQDeviceTypeId === 5 /*gate*/
                        || device.MyQDeviceTypeId === 7 /*MyQGarage(no gateway)*/
                        || device.MyQDeviceTypeId === 17 /*Garage Door Opener WGDO*/) {
                        door_devices.push(device);
                    } else if (device.MyQDeviceTypeId === 3 /*light controller*/) {
                        light_devices.push(device);
                    } else if (device.MyQDeviceTypeId === 1 /*gateway*/) {
                        gateway_devices.push(device);
                    }
                })
                onSuccess.call(self, door_devices, light_devices, gateway_devices);
            } else if(onFail) {
                onFail.call(self, error, response);
            }
        } else if(onFail) {
            onFail.call(self, error, response);
        }
    });
}
MyQPlatform.prototype.sendCommand = function(command, device_id, state, callback) {
    var self = this;
    request.post({
        url : self.host + '/api/v4/deviceattribute/putdeviceattribute',
        headers : {
            'User-Agent': self.userAgent,
            'MyQApplicationId': self.appId,
            'BrandId': self.BrandId,
            'SecurityToken': self.SecurityToken
        },
        json : {
            MyQDeviceId : device_id,
            AttributeName : command,
            AttributeValue: state,
        }
    }, function (error, response, body) {
        if (!error && response.statusCode == 200) {
            self.log(body);
        }
    });
}
MyQPlatform.prototype.door_open = function(device_id, callback) {
    var self = this;
    self.sendCommand.call(self, 'desireddoorstate', device_id, 1, callback);
}
MyQPlatform.prototype.door_close = function(device_id, callback) {
    var self = this;
    self.sendCommand.call(self, 'desireddoorstate', device_id, 0, callback);
}
MyQPlatform.prototype.light_on = function(device_id, callback) {
    var self = this;
    self.sendCommand.call(self, 'desiredlightstate', device_id, 1, callback);
}
MyQPlatform.prototype.light_off = function(device_id, callback) {
    var self = this;
    self.sendCommand.call(self, 'desiredlightstate', device_id, 0, callback);
}

MyQPlatform.prototype.accessories = function(callback) {
    var self = this;
    self.login.call(self, function() {
        self.getDevices.call(self, function(door_devices) {
            self.foundAccessories = [];
            door_devices.forEach(function(device) {
                self.foundAccessories.push(new MyQDoorAccessory(self, device));
            });
            callback(self.foundAccessories);
            self.timer = setTimeout(self.deviceStateTimer.bind(self), 60000);
        });
    });
}
MyQPlatform.prototype.deviceStateTimer = function() {
    var self = this;
    if(self.timer) {
        clearTimeout(self.timer);
    }
    self.getDevices(function(door_devices) {
        self.foundAccessories.forEach(function(accessory) {
            accessory.updateDevice(door_devices);
        });
        self.timer = setTimeout(self.deviceStateTimer.bind(self), 60000);
    }, function (error, response) {
        self.log('get device failed, might be timeout');
        self.log(error);
        self.log(response);
        self.login.call(self, function(securityToken) {
            self.timer = setTimeout(self.deviceStateTimer.bind(self), 200);
        }, function () {
            self.log('login failed??');
        });
    });
}


function MyQDoorAccessory(platform, device) {
    var self = this;
    self.platform = platform;
    self.log = platform.log;
    self.device = device;


    self.currentState = '';
    self.desc = self.device.MyQDeviceId;
    self.isunattendedopenallowed = false;
    self.isunattendedcloseallowed = false;

    self.updateState();
    
    self.log('found GarageDoorOpener, deviceid=%s', self.device.MyQDeviceId);
    self.log('current doorstate=%s', self.currentState);
    
    self.service = new Service.GarageDoorOpener(self.desc);
    self.service.addCharacteristic(LastUpdate);

    self.name = self.desc;
    self.service.getCharacteristic(Characteristic.CurrentDoorState).value = self.currentState;
    self.service.getCharacteristic(LastUpdate).value = self.stateUpdatedTime;
    
    self.service.getCharacteristic(LastUpdate).on('get', function(cb) {
        cb(null, self.stateUpdatedTime);
    }.bind(self));
    
    

    self.service
        .getCharacteristic(Characteristic.CurrentDoorState)
        .on('get', self.getState.bind(self));
    
    self.service
        .getCharacteristic(Characteristic.TargetDoorState)
        .on('get', function() {
            callback(null, self.targetDoorState);
        }.bind(self))
        .on('set', self.setState.bind(self));
}
MyQDoorAccessory.prototype.updateState = function () {
    var self = this;
    self.log('updateState');
    self.device.Attributes.forEach(function(attribute) {
        if (attribute.AttributeDisplayName === 'doorstate') {
            var doorstate = attribute.Value;
            
            var state = self.currentState;
            if(doorstate === '1' || doorstate === '9') {
                state = Characteristic.CurrentDoorState.OPEN;
            } else if(doorstate === '2') {
                state = Characteristic.CurrentDoorState.CLOSED;
            } else if(doorstate === '3') {
                state = Characteristic.CurrentDoorState.STOPPED;
            } else if (doorstate === '4' ||
                (doorstate === '8' && self.currentState === Characteristic.CurrentDoorState.CLOSED)) {
                state = Characteristic.CurrentDoorState.OPENING;
            } else if (doorstate === '5' ||
                (doorstate === '8' && self.currentState === Characteristic.CurrentDoorState.OPEN)) {
                state = Characteristic.CurrentDoorState.CLOSING;
            }
            if(state !== self.currentState && self.service) {
                self.service.getCharacteristic(Characteristic.CurrentDoorState).setValue(state);
            }
            self.currentState = state;
            var updateTimeDesc = moment(attribute.UpdatedTime, 'x').fromNow();
            if(updateTimeDesc !== self.stateUpdatedTime && self.service) {
                self.service.getCharacteristic(LastUpdate).setValue(updateTimeDesc);
            }
            self.stateUpdatedTime = updateTimeDesc;
        } else if(attribute.AttributeDisplayName === 'desc') {
            self.desc = attribute.Value;
        } else if(attribute.AttributeDisplayName === 'isunattendedopenallowed') {
            self.isunattendedopenallowed = attribute.Value === '1';
        } else if(attribute.AttributeDisplayName === 'isunattendedcloseallowed') {
            self.isunattendedcloseallowed = attribute.Value === '1';
        }
    });
    self.log('Door State=[%s]', self.currentState);
    self.log('Door Updated time: [%s]', self.stateUpdatedTime);
    self.log('Door isunattendedopenallowed=[%s]', self.isunattendedopenallowed);
    self.log('Door isunattendedcloseallowed=[%s]', self.isunattendedcloseallowed);
}
MyQDoorAccessory.prototype.updateDevice = function(devices) {
    var self = this;
    for(var i=0; i< devices.length;i++){
        if(self.device.MyQDeviceId === devices[i].MyQDeviceId) {
            self.device = devices[i];
            self.updateState.call(self);
            return true;
        }
    }    
    return false;
}

MyQDoorAccessory.prototype.getState = function(callback) {
    var self = this;
    var state = 0;
    self.log("Getting current state...[%s]", self.currentState);
    callback(null, self.currentState);
}
MyQDoorAccessory.prototype.setState = function(state, callback) {
    var self = this;
    self.log("Set state to %s", state);
    
    if(self.targetDoorState !== state) {
        self.targetDoorState = state;
    }
    
    if(state === Characteristic.TargetDoorState.OPEN) {
        if (!self.isunattendedopenallowed) {
            self.log('unattended open not allowed');
            callback(new Error('unattended open not allowed'));
        } else if(self.currentState === Characteristic.CurrentDoorState.CLOSED) {
            self.log('opening door');
            self.platform.door_open.call(self.platform, self.device.MyQDeviceId, function(){
                callback(null); 
            });
        } else {
            self.log('Can not open door, current state is:[%s]', self.currentState);
            callback(new Error('Can not open door, current state not allowed'));
        }
    } else if (state === Characteristic.TargetDoorState.CLOSED) {
        if(self.currentState === Characteristic.CurrentDoorState.OPEN) {
            self.log('closing door');
            self.platform.door_close.call(self.platform, self.device.MyQDeviceId, function(){
                callback(null); 
            });
        } else {
            self.log('Can not close door, current state is:[%s]', self.currentState);
            callback(new Error('Can not close door, current state not allowed'));
        }
    }
}

MyQDoorAccessory.prototype.getServices = function() {
    var self = this;
    var services = [];
    var service = new Service.AccessoryInformation();
    service.setCharacteristic(Characteristic.Name, self.desc)
        .setCharacteristic(Characteristic.Manufacturer, self.platform.BrandName)
        .setCharacteristic(Characteristic.Model, self.platform.BrandName)
        .setCharacteristic(Characteristic.SerialNumber, self.device.SerialNumber)
        .setCharacteristic(Characteristic.FirmwareRevision, '1.0.0')
        .setCharacteristic(Characteristic.HardwareRevision, '1.0.0');
    services.push(service);
    services.push(self.service);
    return services;
}

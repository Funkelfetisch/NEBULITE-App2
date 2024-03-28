import Device from './Device';
import BleManager from 'react-native-ble-manager';
import {BleManagerModule} from './BleManagerModule';
import {BleWLEDDevice} from './BleWLEDDevice';
import { BleZenggeDevice } from './BLEZenggeDevice';
import {requestBluetoothAndLocationPermissions} from './BlePermissionRequester';

export const bleManagerEmitter = new BleManagerModule();

export const scanForDevices = async (
  addDevice: (device: Device) => void,
): Promise<void> => {
  const devicesFound: Array<string> = [];
  bleManagerEmitter.removeAllSubscription();

  bleManagerEmitter.addListener('BleManagerDiscoverPeripheral', peripheral => {
    // console.log('Discovered', peripheral);
    
    if (
      peripheral.name && peripheral.name === 'WLED BLE2JSON' &&
      !devicesFound.includes(peripheral.id)
    ) {
      devicesFound.push(peripheral.id);
      const device = new BleWLEDDevice(peripheral);
      addDevice(device);
      device.connect();
    }

    if (
      peripheral.name && peripheral.name.startsWith('LEDnetWF') &&
      !devicesFound.includes(peripheral.id)
    ) {
      devicesFound.push(peripheral.id);
      const device = new BleZenggeDevice(peripheral);
      addDevice(device);
      // device.connectAndSetup();
    }


  });

  bleManagerEmitter.addListener('BleManagerStopScan', () => {
    console.log('BleManagerStopScan');
  });

  bleManagerEmitter.addListener('BleManagerDisconnectPeripheral', () => {
    // TODO
    console.log('BleManagerDisconnectPeripheral');
  });

  await requestBluetoothAndLocationPermissions();

  BleManager.enableBluetooth()
  .then(() => {
    // Success code
    console.log("The bluetooth is already enabled or the user confirm");
  })
  .catch((error) => {
    // Failure code
    console.log("The user refuse to enable bluetooth");
  });


  console.log('starting scan');

  await BleManager.scan([], 10, true)
    .then(() => {
      console.log('Scanning...');
    })
    .catch(err => {
      console.error(err);
    });

  return;
};

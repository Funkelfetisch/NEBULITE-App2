import Device from './Device';
import BleManager from 'react-native-ble-manager';
import {bleManagerEmitter} from './bleScanner';
import {StateInfo} from './types';
import * as bleConsts from './bleConst';

interface Request {
  messageBuffer: string;
  resolve: (value: string | PromiseLike<string>) => void;
  reject: (reason?: any) => void;
  page: number;
  param: string;
  endpoint: bleConsts.Endpoint;
}

export class BleZenggeDevice extends Device {
  id: string = '';
  outstandingRequestMap: Record<string, Request> = {};
  connected: boolean = false;
  si?: StateInfo = undefined;
  notifyBuffer = '';

  private static packetCounter: number = 0;
  private static specialSecretArray: number[] = [
    0x11, 0x22, 0x4, 0x8, -0x67, 0x4, 0x24, 0x16, 0x4, -0x56,
    -0x45, -0x34, -0x10, 0x60, 0x61, -0x33, -0x31, -0x80, 0x35, 0x2a,
    // ... other elements as needed
  ];

  // Translated encoding functions
  private getPacketCounter(): number {
    return BleZenggeDevice.packetCounter++;
  }

  private encrypt1(incomingArray: number[], randNum: number, thing1: number, thing2: number): number[] {
    return incomingArray.map((item, i) => (item ^ randNum ^ thing1 ^ thing2) & 0xFF);
  }

  private encrypt2(incomingArray: number[], startPos: number, length: number): number[] {
    return incomingArray.map((item, i) => {
      if (i >= startPos && i < startPos + length) {
        return (item ^ BleZenggeDevice.specialSecretArray[i - startPos]) & 0xFF;
      }
      return item;
    });
  }

  private toCrc(incomingArray: number[]): number {
    let sum = incomingArray.reduce((acc, val) => acc + val, 0);
    return sum & 0xFFFF;
  }

  private reversal(incomingArray: number[]): number[] {
    let arr = [...incomingArray];
    let v0 = 2;
    let v1 = arr.length - 1;
    while (v0 <= v1) {
      let temp = arr[v0];
      arr[v0] = arr[v0 + 1];
      arr[v0 + 1] = temp;
      v0 += 2;
    }
    return arr;
  }

  private encoder(p0: number, p1: number, p2: number, incomingArray: number[]): number[] {
    const v0 = 9;
    const alen = incomingArray.length;
    if (alen === 0 || alen > v0) {
      console.log("Array too long");
      return []; // or handle the error as needed
    }

    const header = [0x5a, 0x71, 0x0, 0x11, 0x0, p1, this.getPacketCounter()];
    let new_array = new Array(26).fill(0); // Initializing array with zeros

    // Processing p2
    new_array[7] = (p2 & 0xff0000) >> 16;
    new_array[8] = (p2 & 0xff00) >> 8;
    new_array[9] = p2 & 0xff;

    new_array[10] = 0;
    new_array[11] = 0;
    new_array[12] = p0;

    // Copying incomingArray to new_array starting at position 13
    for (let i = 0; i < alen; i++) {
      new_array[13 + i] = incomingArray[i];
    }

    const randInt = Math.floor(Math.random() * 256); // Random integer between 0 and 255
    new_array[23] = randInt; // 0x17

    new_array = this.encrypt1(new_array, randInt, 0xa, 0x16);
    new_array = this.encrypt2(new_array, 0x4, 0x17);

    const crcResult = this.toCrc(new_array);
    new_array[24] = (crcResult & 0xff00) >> 8; // 0x18
    new_array[25] = crcResult & 0xff; // 0x19

    new_array = this.reversal(new_array);

    return new_array;
  }

  constructor(peripheral: any) {
    super(peripheral.advertising.localName);
    this.id = peripheral.id;
  }

  convertString(value: string): Array<number> {
    const charCodeArr = [];

    for (let i = 0; i < value.length; i++) {
      let code = value.charCodeAt(i);
      charCodeArr.push(code);
    }

    return charCodeArr;
  }

  async startDataNotifications() {
    for (const key in bleConsts.pathMapping) {
      const info = bleConsts.pathMapping[key];
      await BleManager.startNotification(this.id, info.service, info.data);
    }
  }

  mapRequestResponse(response: string, charId: string): string {
    switch (charId) {
      case bleConsts.WLED_BLE_FX_DETAILS_DATA_ID:
      case bleConsts.WLED_BLE_FX_NAMES_DATA_ID:
      case bleConsts.WLED_BLE_PALETTE_NAME_DATA_ID:
        return JSON.stringify(JSON.parse(response).array);
      default:
        return response;
    }
  }

  async connect(): Promise<void> {
    console.log('connecting Zengge BLE device');
    await BleManager.connect(this.id);
    // bleManagerEmitter.addListener(
    //   'BleManagerDidUpdateValueForCharacteristic',
    //   (data: any) => {
    //     if (data.characteristic === bleConsts.WLED_BLE_PRESETS_DATA_ID) {
    //       console.log('got preset data: ' + data.value.length);
    //     }

    //     if (data.peripheral === this.id) {
    //       if (data.characteristic === bleConsts.WLED_BLE_STATE_INFO_NOTIFY_ID) {
    //         this.notifyBuffer += String.fromCharCode.apply(null, data.value);

    //         if (data.value.length !== bleConsts.CHUNK_LENGTH) {
    //           if (this.si) this.si = JSON.parse(this.notifyBuffer);
    //           this.notify(this.notifyBuffer);
    //           this.notifyBuffer = '';
    //         }
    //         return;
    //       }

    //       const request = this.outstandingRequestMap[data.characteristic];

    //       if (request) {
    //         request.messageBuffer += String.fromCharCode.apply(
    //           null,
    //           data.value,
    //         );
    //         if (data.value.length !== bleConsts.CHUNK_LENGTH) {
    //           request.resolve(
    //             this.mapRequestResponse(
    //               request.messageBuffer,
    //               data.characteristic,
    //             ),
    //           );
    //           request.messageBuffer = '';
    //         } else {
    //           request.page++;
    //           BleManager.write(
    //             this.id,
    //             request.endpoint.service,
    //             request.endpoint.control,
    //             this.convertString('r' + request.param + ':' + request.page),
    //           );
    //         }
    //       }
    //     }
    //   },
    // );
    console.log('connect 1');
    await BleManager.retrieveServices(this.id);
    console.log('connect 2');

    await this.startDataNotifications();

    console.log('connect 3');
    await BleManager.startNotification(
      this.id,
      bleConsts.WLED_BLE_DATA_SERVICE_ID,
      bleConsts.WLED_BLE_STATE_INFO_NOTIFY_ID,
    );
    console.log('connect 4');

    this.si = JSON.parse(await this.get('http://localhost/json/si'));
    this.connected = true;
    this.notify('{}');
  }

  startRead(
    endpoint: {service: string; data: string; control: string},
    param: string,
  ): Promise<string> {
    return new Promise<string>((resolve, reject) => {
      console.log('starting read', endpoint);
      BleManager.write(
        this.id,
        endpoint.service,
        endpoint.control,
        this.convertString('r' + param + ':1'),
      );
      this.outstandingRequestMap[endpoint.data] = {
        messageBuffer: '',
        resolve,
        reject,
        page: 1,
        param,
        endpoint,
      };
    });
  }

  async get(command: string): Promise<string> {
    const url = new URL(command);

    const path = url.pathname;

    console.log('reading ' + path);

    const endpoint = bleConsts.pathMapping[path];

    const page = url.searchParams.get('page') || '';

    if (endpoint) {
      return this.startRead(endpoint, page);
    }

    console.log('unknown path request', {path});

    return '{}';
  }

  async chunckWrite(data: number[]): Promise<void> {
    if (data.length % bleConsts.CHUNK_LENGTH === 0) {
      data.push(32); // append a space
    }

    let remaining = data.length;
    let pos = 0;

    do {
      const toWrite = Math.min(remaining, bleConsts.CHUNK_LENGTH);

      console.log('posting chunk', {pos, toWrite, len: data.length, remaining});

      await BleManager.write(
        this.id,
        bleConsts.WLED_BLE_DATA_SERVICE_ID,
        bleConsts.WLED_BLE_STATE_INFO_DATA_ID,
        data.slice(pos, pos + toWrite),
        bleConsts.CHUNK_LENGTH,
      );

      pos += toWrite;
      remaining -= toWrite;

      console.log('posted chunk', {
        next: pos,
        wrote: toWrite,
        len: data.length,
        nextRemaining: remaining,
      });
    } while (remaining > 0);
  }

  async post(command: string, body: string) {
    const path = command.split('/').slice(3).join('/');

    console.log('post', {command, body});

    if (path === 'json/state' || path === 'json/si') {
      console.log('posting', body);
      await this.chunckWrite(this.convertString(body));
    }

    return JSON.stringify({success: true});
  }

  getVersion(): string {
    return this.si?.info?.ver || 'unknown';
  }

  hasBle(): boolean {
    return true;
  }

  isOn(): boolean {
    return !!this.si?.state?.on;
  }

  bright(): number {
    return this.si?.state?.bri || 0;
  }

  getType(): string {
    return 'ble';
  }

  isConnected(): boolean {
    return this.connected;
  }
}

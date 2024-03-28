import Device from './Device';
import BleManager from 'react-native-ble-manager';
import { bleManagerEmitter } from './bleScanner';
import { StateInfo } from './types';
import * as bleConsts from './bleConst';
import { Buffer } from 'buffer';

const SERVICE_UUID = "0000ffff-0000-1000-8000-00805f9b34fb";
const NOTIFY_UUID = "0000ff02-0000-1000-8000-00805f9b34fb";
const WRITE_UUID = "0000ff01-0000-1000-8000-00805f9b34fb";

// Initial Packets translated from Python bytearray.fromhex()
const INITIAL_PACKET = [0x00, 0x01, 0x80, 0x00, 0x00, 0x04, 0x05, 0x0a, 0x81, 0x8a, 0x8b, 0x96];
const INITIAL_PACKET_2 = [0x00, 0x02, 0x80, 0x00, 0x00, 0x0c, 0x0d, 0x0b, 0x10, 0x14, 0x16, 0x0b, 0x05, 0x0d, 0x36, 0x36, 0x06, 0x00, 0x0f, 0xd8];
let COUNTER = 0;
const PIXEL_COUNT = 48; // This might need to be dynamically determined
// Constants for packets (placeholders for actual packet data)
const ON_PACKET = Buffer.from("00048000000d0e0b3b2300000000000032000090", "hex");
const OFF_PACKET = Buffer.from("005b8000000d0e0b3b2400000000000032000091", "hex");
const WHITE_PACKET = [0x00, 0x10, 0x80, 0x00, 0x00, 0x0d, 0x0e, 0x0b, 0x3b, 0xb1, 0x00, 0x00, 0x00, 0x1b, 0x36, 0x00, 0x00, 0x00, 0x00, 0x00, 0x3d];
const MODE_PACKET = Buffer.from("000680000004050b38010164", "hex");
const HSV_PACKET = Buffer.from("00058000000d0e0b3ba100646400000000000000", "hex");
const STATE_REQUEST_PACKET = Buffer.from("your_state_request_packet_data_here", "hex"); // Define this based on your device's protocol

function getCounter(): number {
  return COUNTER++;
}

// Function to prepare a packet
function preparePacket(packet: Buffer): Buffer {
  let count = getCounter();
  packet.writeUInt16BE(count, 0);
  return packet;
}

// Utility method to convert a string to a byte array
function convertStringToByteArray(value: string): number[] {
  return Array.from(Buffer.from(value, 'utf8'));
}


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

  constructor(peripheral: any) {
    super(peripheral.advertising.localName);
    this.id = peripheral.id;
  }

  // Additional methods translated and adapted from the Python script
  async sendPreparedPacket(serviceUUID: string, characteristicUUID: string, packet: number[]): Promise<void> {
    await BleManager.write(this.id, serviceUUID, characteristicUUID, packet);
  }

  async setWhite(temperature: number, brightness: number): Promise<void> {
    console.log(`Setting white temperature to ${temperature}% and ${brightness}% brightness`);
    let whitePacket = Array.from(WHITE_PACKET); // Assuming WHITE_PACKET is defined elsewhere
    whitePacket[13] = temperature;
    whitePacket[14] = brightness;
    await this.sendPreparedPacket(SERVICE_UUID, WRITE_UUID, whitePacket);
  }

  async setRgb(r: number, g: number, b: number): Promise<void> {
    console.log(`Setting RGB colour: ${r}, ${g}, ${b}`);
    // Conversion from RGB to HSV might need to be implemented or use a library
    let hsv = this.rgbToHsv(r, g, b); // Assuming this method exists
    let hsvPacket = Array.from(HSV_PACKET); // Assuming HSV_PACKET is defined elsewhere
    hsvPacket[10] = hsv[0];
    hsvPacket[11] = hsv[1];
    hsvPacket[12] = hsv[2];
    await this.sendPreparedPacket(SERVICE_UUID, WRITE_UUID, hsvPacket);
  }

  // Added methods for device control translated from the Python script
  async setPower(on: boolean): Promise<void> {
    const packet = on ? Array.from(ON_PACKET) : Array.from(OFF_PACKET); // Assuming ON_PACKET and OFF_PACKET are defined
    await this.sendPreparedPacket(SERVICE_UUID, WRITE_UUID, packet);
    console.log(`Power ${on ? 'ON' : 'OFF'}`);
  }

  async setMode(mode: number, speed: number, brightness: number): Promise<void> {
    let modePacket = Array.from(MODE_PACKET); // Assuming MODE_PACKET is defined
    modePacket[9] = mode;
    modePacket[10] = speed;
    modePacket[11] = brightness;
    await this.sendPreparedPacket(SERVICE_UUID, WRITE_UUID, modePacket);
    console.log(`Mode set: ${mode}, Speed: ${speed}, Brightness: ${brightness}`);
  }

  // Convert RGB to HSV (assuming this is a placeholder for actual implementation or external library usage)
  rgbToHsv(r: number, g: number, b: number): [number, number, number] {
    // Placeholder for RGB to HSV conversion
    // Implement this method based on your requirements or use an external library
    return [0, 0, 0]; // Dummy return
  }

  async connect(): Promise<void> {
    console.log('Connecting to device:', this.id);

    // Connect to the device
    try {
      await BleManager.connect(this.id);
      console.log('Connected to', this.id);

      // Retrieve the list of services and characteristics
      const services = await BleManager.retrieveServices(this.id);
      console.log('Retrieved services:', services);

      // Start notification on the characteristic of interest
      await BleManager.startNotification(this.id, SERVICE_UUID, NOTIFY_UUID);
      console.log(`Started notification for ${NOTIFY_UUID}`);

      // Set up a listener for BLE notifications
      bleManagerEmitter.addListener(
        'BleManagerDidUpdateValueForCharacteristic',
        ({ value, peripheral, characteristic }) => {
          if (peripheral === this.id && characteristic === NOTIFY_UUID) {
            // const data = Buffer.from(value).toString('utf8');
            // this.handleResponse(value); // Assuming handleResponse method is implemented
            this.responseDecode(value);
          }
        }
      );

      // Convert initial commands to byte arrays
      const initialState = this.convertHexToByteArray("000180000004050a818a8b96");
      const initialState2 = this.convertHexToByteArray("00028000000c0d0b1014160b050d363606000fd8");

      // Sending the first initial packet
      await BleManager.write(this.id, SERVICE_UUID, WRITE_UUID, initialState);
      console.log("Initial packet sent.");

      // Sending the second initial packet
      // await BleManager.write(this.id, SERVICE_UUID, WRITE_UUID, initialState2);
      // console.log("Initial packet 2 sent.");

      // Setup complete
      console.log("Device setup complete.");

      this.connected = true; // Mark the device as connected


      this.setPower(true);

      
      // // wait for 2 seconds 
      // await new Promise(resolve => setTimeout(resolve, 4000));

      // this.setMode(0, 100, 100);      
      // // wait for 2 seconds 
      // await new Promise(resolve => setTimeout(resolve, 6000));

      // this.setMode(1, 100, 100);      
      // // wait for 2 seconds 
      // await new Promise(resolve => setTimeout(resolve, 6000));

      // this.setMode(2, 100, 100);
      // // wait for 2 seconds 
      // await new Promise(resolve => setTimeout(resolve, 6000));

      // this.setMode(3, 100, 100);

      // await new Promise(resolve => setTimeout(resolve, 6000));

      // this.setMode(1, 100, 100);      

    
    } catch (error) {
      console.error('Connection failed:', error);
      throw error; // Re-throw the error for handling by the caller
    }
  }


responseDecode(response: Buffer) {
  // Convert the numeric byte values back into a string
  let responseStr = String.fromCharCode(...response);

  // Find the start of the JSON structure and discard any leading non-JSON characters
  const jsonStartIndex = responseStr.indexOf('{');
  if (jsonStartIndex > -1) {
      responseStr = responseStr.substring(jsonStartIndex);
  }

  try {
      // Attempt to parse the JSON response
      const jsonResponse = JSON.parse(responseStr);

      // Check if the 'payload' field exists and is a string
      if (typeof jsonResponse.payload === 'string') {
          const payloadHex = jsonResponse.payload; // Assuming the payload is a hex string
          console.log(`Response Payload: ${payloadHex}`);
          const payloadBytes = Buffer.from(payloadHex, 'hex');

          // Handle the 'power' byte
          const power = payloadBytes[2];
          switch (power) {
              case 0x23:
                  console.log('Power: ON');
                  break;
              case 0x24:
                  console.log('Power: OFF');
                  break;
              default:
                  console.log(`Unknown Power Byte: ${power}`);
          }

          // Handle the 'mode' byte
          const mode = payloadBytes[4];
          if (mode === 0xF0) {
              // RGB mode
              const [r, g, b] = [payloadBytes[6], payloadBytes[7], payloadBytes[8]];
              console.log(`RGB: ${r}, ${g}, ${b}`);
          } else if (mode === 0x0F) {
              // White mode
              const temp = payloadBytes[9];
              const brightness = payloadBytes[5];
              console.log(`White Temperature: ${temp}, Brightness: ${brightness}`);
          } else if (mode > 0x0 && mode < 0x72) {
              // Symphony modes
              console.log(`Symphony Mode: ${mode}`);
              const brightness = payloadBytes[6];
              const speed = payloadBytes[7];
              console.log(`Speed: ${speed}, Brightness: ${brightness}`);
          } else {
              // Unknown or custom mode
              console.log(`Mode: ${mode}`);
              console.log(`Payload: ${payloadHex}`);
          }
      } else {
          console.error('Invalid or missing payload in JSON response.');
      }
  } catch (error) {
      console.error('Error parsing JSON response:', error);
      console.log(`Response String: ${responseStr}`);
  }
}


  // Example helper method to parse state info messages
  private handleStateInfo(data: number[]) {
    // Assuming the device sends state info in a specific format
    // For example, [brightness, on/off state, ...]
    const brightness = data[0];
    const isOn = data[1] === 1;

    // Update the internal state
    this.si = { ...this.si, bright: brightness, on: isOn } as StateInfo;
    console.log('Device state updated:', this.si);

    // Emit an event or call a method to update UI or other parts of your application
    // Example: this.emit('stateUpdated', this.si);
  }







  // Enhanced method to send data packets to the device, handling chunking if necessary
  async sendPacketWithChunking(characteristicUUID: string, packet: number[]): Promise<void> {
    const MAX_CHUNK_SIZE = 20; // BLE max chunk size might vary, 20 is a common value
    for (let offset = 0; offset < packet.length; offset += MAX_CHUNK_SIZE) {
      const chunk = packet.slice(offset, offset + MAX_CHUNK_SIZE);
      await BleManager.write(this.id, SERVICE_UUID, characteristicUUID, chunk);
    }
    console.log(`Packet sent to ${characteristicUUID}, length: ${packet.length}`);
  }

  // Implementing device control methods translated and adapted from the Python script
  // Example: Method to turn the device on or off
  async powerDevice(on: boolean): Promise<void> {
    const packet = on ? Array.from(ON_PACKET) : Array.from(OFF_PACKET);
    await this.sendPacketWithChunking(WRITE_UUID, packet);
    console.log(`Device powered ${on ? 'on' : 'off'}`);
  }

  // Implementing response handling
  processResponse(data: number[]) {
    // Example: Process a simple notification indicating device state change
    console.log("Processing response from device:", data.toString());
    // Interpret the response based on your device's protocol
    // This might include parsing JSON data, extracting specific byte values, etc.
    // Update the device state or UI as needed
  }

  // Example method to request the current state of the device
  async requestDeviceState(): Promise<void> {
    // Construct the packet to request device state, if your device supports this operation
    let stateRequestPacket = Array.from(STATE_REQUEST_PACKET); // Define this packet as per your device's protocol
    await this.sendPacketWithChunking(WRITE_UUID, stateRequestPacket);
    console.log("Requested device state.");
  }


  // Subscribe to notifications from the device
  async subscribeToNotifications(characteristicUUID: string) {
    await BleManager.startNotification(this.id, SERVICE_UUID, characteristicUUID);
    console.log(`Subscribed to notifications for ${characteristicUUID}`);
    bleManagerEmitter.addListener(
      'BleManagerDidUpdateValueForCharacteristic',
      ({ value, peripheral, characteristic }) => {
        if (peripheral === this.id && characteristic === characteristicUUID) {
          this.processResponse(value);
        }
      }
    );
  }

  // // Example: Method to update the device state information
  // async updateStateInfo(): Promise<void> {
  //   // Assuming STATE_INFO_PACKET is defined and corresponds to a request for state info
  //   await this.sendPacketWithChunking(WRITE_UUID, Array.from(STATE_INFO_PACKET));
  //   console.log("State info update requested");
  // }






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

  async connectAndSetup() {
    console.log('connecting');
    await BleManager.connect(this.id);
    console.log('connected');
    await this.startDataNotifications();
  }

  startRead(
    endpoint: { service: string; data: string; control: string },
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

    console.log('unknown path request', { path });

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

      console.log('posting chunk', { pos, toWrite, len: data.length, remaining });

      await BleManager.write(
        this.id,
        SERVICE_UUID,
        WRITE_UUID,
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

    console.log('post', { command, body });

    if (path === 'json/state' || path === 'json/si') {
      console.log('posting', body);
      await this.chunckWrite(this.convertString(body));
    }

    return JSON.stringify({ success: true });
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

  convertHexToByteArray(hexString: string): number[] {
    const byteArray = [];
    for (let i = 0; i < hexString.length; i += 2) {
      byteArray.push(parseInt(hexString.substring(i, i + 2), 16));
    }
    return byteArray;
  }
}

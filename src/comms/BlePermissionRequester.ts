import { PermissionsAndroid, Platform } from 'react-native';

export const requestBluetoothAndLocationPermissions = async () => {
  if (Platform.OS === 'android' && Platform.Version >= 31) {
    // For Android 12 and above, request BLUETOOTH_SCAN permission
    const bluetoothScanResult = await PermissionsAndroid.request(
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      {
        title: "Bluetooth Scan Permission",
        message: "This app needs permission to scan for Bluetooth devices.",
        buttonNeutral: "Ask Me Later",
        buttonNegative: "Cancel",
        buttonPositive: "OK",
      }
    );

    if (bluetoothScanResult !== PermissionsAndroid.RESULTS.GRANTED) {
      console.log("Bluetooth scan permission denied");
      // Handle permission denial appropriately
      return;
    }

    const bluetoothConnectResult = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        {
          title: "Bluetooth Connect Permission",
          message: "This app needs permission to connect to Bluetooth devices.",
          buttonNeutral: "Ask Me Later",
          buttonNegative: "Cancel",
          buttonPositive: "OK",
        }
      );
  
      if (bluetoothConnectResult !== PermissionsAndroid.RESULTS.GRANTED) {
        console.log("Bluetooth connect permission denied");
        // Handle permission denial appropriately
        return;
      }
  }

  // Request location permission for all Android versions (necessary for BLE scanning)
  const locationPermissionResult = await PermissionsAndroid.request(
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    {
      title: "Location Permission",
      message: "This app needs access to your location for BLE scanning.",
      buttonNeutral: "Ask Me Later",
      buttonNegative: "Cancel",
      buttonPositive: "OK",
    }
  );

  if (locationPermissionResult !== PermissionsAndroid.RESULTS.GRANTED) {
    console.log("Location permission denied");
    // Handle permission denial appropriately
  } else {
    console.log("Permissions granted");
    // Permissions are granted; you can start scanning for BLE devices here
  }
};

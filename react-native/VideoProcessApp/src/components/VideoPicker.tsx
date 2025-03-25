import React, { useState } from "react";
import { View, Alert, Image, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import * as ImagePicker from "react-native-image-picker";
import { EyePop } from '@eyepop.ai/react-native-eyepop';

const VideoPicker = () => {
  const [isProcessing, setIsProcessing] = useState(false);

  const sendImageToEyePop = async () => {
    setIsProcessing(true);
    try {
      // Open media picker
      const picked = await ImagePicker.launchImageLibrary({
        mediaType: "mixed", // Supports images & videos
        quality: 1,
      });

      if (picked.didCancel || !picked.assets) {
        return;
      }

      const file = picked.assets[0];
      if(!file || !file.uri) {
        Alert.alert("Error", "No file selected.");
        return;
      }
      // Initialize the EyePop worker endpoint
      let endpoint = EyePop.workerEndpoint({
        auth: { secretKey: process.env.EYEPOP_API_KEY || "" },
        popId: process.env.EYEPOP_POP_UUID,
        eyepopUrl: process.env.EYEPOP_URL || undefined,
      });

      console.log("Connecting to EyePop Endpoint ...");
      try {
        endpoint = await endpoint.connect();
      } catch (error) {
        console.error("Error during connection:", error);
        Alert.alert("Error", "Failed to connect to EyePop.ai");
        return;
      }

      console.log(`Sending ${file.fileName} (mimeType=${file.type}) to EyePop...`);

      // Prepare file path
      const filePath = file.uri.replace("file://", "");
            
      const results = await endpoint.process({ path: filePath, mimeType: file.type });
      console.log("results start");
      for await (const result of results) {
        console.log(JSON.stringify(result));
      }
      console.log("results end");
      setIsProcessing(false);
      Alert.alert("Done", `${file.type} check logs for results`);
    } catch (error) {
      console.error("Error:", error);
      Alert.alert("Error", "Failed to send image/video.");
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <View style={styles.container}>
      {isProcessing ? (
        <ActivityIndicator size="large" color="#00f" />
      ) : (
        <TouchableOpacity onPress={sendImageToEyePop}>
          <Image source={require("../assets/icon.png")} style={styles.octopus} />
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#E0F7FA",
  },
  octopus: {
    width: 200,
    height: 200,
    resizeMode: "contain",
  },
});

export default VideoPicker;

import React, { useState } from "react";
import { View, Alert, Image, TouchableOpacity, ActivityIndicator, StyleSheet } from "react-native";
import * as ImagePicker from "react-native-image-picker";
import EyePop, {ForwardOperatorType, PopComponentType, StreamSource} from '@eyepop.ai/eyepop';

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
      if(!file) {
        Alert.alert("Error", "No file selected.");
        return;
      }


      const popUUID = "ef8d4e147cf641cea7284dc3e6f68517";
      const apiKey =
        "AAE_w6lCcrCa27chNAbZO-WdZ0FBQUFBQmwyUFk5bmtLZnJBQ2RFVWVDbzU1MnkwTUMzYXhQWjA4a0ZEczFKWWdONjdRS0NGWUZ5aF90aXVQZ3FrcWdkZWwwUEx6Q0luM0F3b3ItMjdqRmhUQkxyTWVvSndFLWRCUENjZGNlanZhbGhRTDdtV289";

      // Initialize the EyePop worker endpoint
      let endpoint = EyePop.workerEndpoint({
        auth: { secretKey: apiKey },
        popId: popUUID,
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

      console.log("Type of results:", typeof results);
      console.log("results.constructor.name:", results?.constructor?.name);
      console.log("Is async iterable:", Symbol.asyncIterator in results);
      console.log("Has read method:", typeof results?.read === 'function');
      console.log("Has next method:", typeof results?.next === 'function');

      
      //Alert.alert("Success", `${file.type} sent successfully to EyePop!`);
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
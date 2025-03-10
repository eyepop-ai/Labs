import React from "react";
import { SafeAreaView } from "react-native";
import VideoPicker from "./src/components/VideoPicker";

const App = () => {
  return (
    <SafeAreaView style={{ flex: 1 }}>
      <VideoPicker />
    </SafeAreaView>
  );
};

export default App;
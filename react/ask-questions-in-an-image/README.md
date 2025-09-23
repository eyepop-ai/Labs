# Getting Started with Image Q&A

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)

# Ask Questions of an Image

Ask Questions of an Image is a React app that allows you to drag and drop an image, define a list of questions, and get answers powered by [EyePop.ai](https://eyepop.ai). The app is styled with EyePop branding for a seamless user experience.

## Features
- **Drag-and-drop image upload**: Easily upload images by dragging and dropping.
- **Question list**: Add and remove questions to ask about your image.
- **EyePop.ai integration**: Processes your image and questions using the EyePop.ai API.
- **Results display**: See answers to your questions, visually connected to your image.
- **Branded styling**: Clean, modern UI with EyePop branding.

## Installation
1. **Clone the repository:**
   ```bash
   git clone https://github.com/your-username/ask-questions-in-an-image.git
   cd ask-questions-in-an-image
   ```
2. **Install dependencies:**
   ```bash
   npm install
   ```
3. **Set up environment variables:**
   - Create a `.env` file in the root directory.
   - Add your EyePop.ai API key:
     ```
     NEXT_PUBLIC_ANYTHING_POP_API_KEY=your_eyepop_api_key_here
     ```

## Usage
1. **Start the development server:**
   ```bash
   npm start
   ```
2. **Open the app** in your browser at [http://localhost:3000](http://localhost:3000).
3. **Drag and drop an image** into the upload area.
4. **Add your questions** to the list (you can add or remove questions).
5. **Click "Continue"** to process your image and questions with EyePop.ai.
6. **View the results**: Answers will be displayed alongside your image.

## Environment Variables
- `NEXT_PUBLIC_ANYTHING_POP_API_KEY`: Your EyePop.ai API key. Required for API access.

## Tech Stack
- **React**: UI framework
- **EyePop.ai SDK**: Image and question processing
- **CSS**: Custom styling with EyePop branding

## Future Improvements
- Support for multiple images
- Richer result visualizations and answer explanations
- Improved error handling and user feedback
- Mobile/responsive design enhancements
- User authentication and history of past queries
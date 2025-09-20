import { exec } from "child_process";
import util from "util";
import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import { promises as fs } from "fs";
import OpenAI from "openai";
import fetch from "node-fetch";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";

dotenv.config();

const execPromise = util.promisify(exec);

const openai = new OpenAI({
  apiKey: process.env.OPENROUTER_API_KEY,
  baseURL: "https://openrouter.ai/api/v1",
});

// Updated to use your working Hugging Face Spaces server
const TTS_SERVER_URL = "https://eshwar06-kokoro-tts-api.hf.space";

const app = express();
app.use(express.json());
app.use(cors());
const port = 3001;


// Emotion-based speech parameters - optimized for female companion
const EMOTION_SPEECH_SETTINGS = {
  angry: {
    speed: 1.3,
    voice_variants: ["af_nova", "af_river", "bf_emma"],
    pitch_modifier: "high",
  },
  sad: {
    speed: 0.6,
    voice_variants: ["af_heart", "af_bella", "bf_lily"],
    pitch_modifier: "low",
  },
  surprised: {
    speed: 1.4,
    voice_variants: ["af_sky", "af_nova", "bf_alice"],
    pitch_modifier: "varied",
  },
  funnyFace: {
    speed: 1.2,
    voice_variants: ["af_bella", "af_jessica", "bf_alice"],
    pitch_modifier: "varied",
  },
  smile: {
    speed: 1.0,
    voice_variants: ["af_sarah", "af_heart", "af_aoede"],
    pitch_modifier: "normal",
  },
  default: {
    speed: 1.0,
    voice_variants: ["af_heart", "af_sarah", "af_nicole"],
    pitch_modifier: "normal",
  },
};

app.get("/", (req, res) => {
  res.send("Digital Companion Server - Dynamic Speech + OpenRouter");
});

// Get voices from your TTS server
app.get("/voices", async (req, res) => {
  try {
    const response = await fetch(`${TTS_SERVER_URL}/v1/audio/voices`);
    const voices = await response.json();
    res.json(voices);
  } catch (error) {
    console.error("Error fetching voices:", error);
    res.status(500).json({ error: "Failed to fetch voices" });
  }
});

const execCommand = (command) => {
  return new Promise((resolve, reject) => {
    exec(command, (error, stdout, stderr) => {
      if (error) {
        console.error(`Command failed: ${command}`);
        console.error(`stderr: ${stderr}`);
        reject(error);
      }
      resolve(stdout);
    });
  });
};

// Smart voice selection - optimized for female companion
const selectVoiceForEmotion = (emotion, genderPreference = "female") => {
  const emotionSettings =
    EMOTION_SPEECH_SETTINGS[emotion] || EMOTION_SPEECH_SETTINGS["default"];
  let availableVoices = emotionSettings.voice_variants;

  availableVoices = availableVoices.filter(
    (voice) => voice.startsWith("af_") || voice.startsWith("bf_")
  );

  return availableVoices[Math.floor(Math.random() * availableVoices.length)];
};

// Generate TTS with dynamic speech based on emotion - proper MP3 → WAV conversion
const generateDynamicTTS = async (
  text,
  emotion = "default",
  messageIndex = 0
) => {
  try {
    console.log(`Generating dynamic female speech for message ${messageIndex}`);
    console.log(`Text: "${text.substring(0, 50)}..."`);
    console.log(`Emotion: ${emotion}`);

    const emotionSettings =
      EMOTION_SPEECH_SETTINGS[emotion] || EMOTION_SPEECH_SETTINGS["default"];
    const selectedVoice = selectVoiceForEmotion(emotion);
    const speechSpeed = emotionSettings.speed;

    console.log(
      `Selected female voice: ${selectedVoice}, Speed: ${speechSpeed}x`
    );

    const response = await fetch(`${TTS_SERVER_URL}/v1/audio/speech`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        input: text,
        voice: selectedVoice,
        speed: speechSpeed,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`TTS API error: ${response.status} - ${errorText}`);
      throw new Error(`TTS API responded with status ${response.status}`);
    }

    const audioBuffer = await response.arrayBuffer();
    const audioBase64 = Buffer.from(audioBuffer).toString("base64");

    // Save MP3
    const mp3FileName = `audios/message_${messageIndex}.mp3`;
    await fs.writeFile(mp3FileName, Buffer.from(audioBuffer));

    // Convert MP3 → PCM WAV for Rhubarb
const wavFileName = `audios/message_${messageIndex}.wav`;
const ffmpegCmd = `"${ffmpegPath.path}" -y -i "${mp3FileName}" -ar 44100 -ac 1 -sample_fmt s16 "${wavFileName}"`;
try {
  await execPromise(ffmpegCmd);
  console.log(`Converted MP3 → WAV for lip sync (${wavFileName})`);
} catch (err) {
  console.error("ffmpeg conversion failed:", err);
  throw new Error("Failed to convert MP3 to WAV for lip sync");
}

    console.log(`Dynamic female speech generated successfully`);
    console.log(
      `Voice: ${selectedVoice}, Speed: ${speechSpeed}x, Size: ${audioBuffer.byteLength} bytes`
    );

    return {
      audioBase64: audioBase64,
      fileName: wavFileName,
      voiceUsed: selectedVoice,
      speedUsed: speechSpeed,
      emotion: emotion,
    };
  } catch (error) {
    console.error("Dynamic female TTS generation error:", error);
    throw error;
  }
};


const lipSyncMessage = async (message) => {
  const time = new Date().getTime();
  console.log(`Starting lip sync for message ${message}`);

  try {
    // Use the WAV file directly (no FFmpeg conversion needed)
    const wavFile = `audios/message_${message}.wav`;
    
    // Check if WAV file exists
    try {
      await fs.access(wavFile);
      console.log(`WAV file found: ${wavFile}`);
    } catch (fileError) {
      console.error(`WAV file not found: ${wavFile}`);
      throw new Error(`Audio file not found: ${wavFile}`);
    }
    
    // Use the correct path to rhubarb.exe
    const rhubarbPath = "..\\Rhubarb-Lip-Sync-1.14.0-Windows\\Rhubarb-Lip-Sync-1.14.0-Windows\\rhubarb.exe";
    const command = `"${rhubarbPath}" "${wavFile}" -f json -o audios/message_${message}.json`;
    
    console.log(`Running Rhubarb command: ${command}`);
    await execCommand(command);
    
    console.log(`Lip sync done in ${new Date().getTime() - time}ms`);
  } catch (error) {
    console.error(`Lip sync error for message ${message}:`, error);
    console.error(`Error details:`, error.message);
    
    // Create empty lipsync data as fallback
    const emptyLipsync = { 
      mouthCues: [],
      metadata: {
        soundFile: `audios/message_${message}.wav`,
        duration: 0
      }
    };
    await fs.writeFile(`audios/message_${message}.json`, JSON.stringify(emptyLipsync, null, 2));
    console.log(`Created fallback lip sync data for message ${message}`);
  }
};

app.post("/chat", async (req, res) => {
  const userMessage = req.body.message;
  
  if (!userMessage) {
    res.send({
      messages: [
        {
          text: "Hey there! How was your day?",
          audio: await audioFileToBase64("audios/intro_0.wav"),
          lipsync: await readJsonTranscript("audios/intro_0.json"),
          facialExpression: "smile",
          animation: "Talking_1",
        },
        {
          text: "I'm here to chat with you anytime!",
          audio: await audioFileToBase64("audios/intro_1.wav"),
          lipsync: await readJsonTranscript("audios/intro_1.json"),
          facialExpression: "smile",
          animation: "Talking_2",
        },
      ],
    });
    return;
  }

  if (!process.env.OPENROUTER_API_KEY || process.env.OPENROUTER_API_KEY === "-") {
    res.send({
      messages: [
        {
          text: "Please add your OpenRouter API key to get started!",
          audio: "",
          lipsync: { mouthCues: [] },
          facialExpression: "sad",
          animation: "Talking_1",
        },
      ],
    });
    return;
  }

  try {
    console.log(`Processing user message: "${userMessage}"`);
    
    const completion = await openai.chat.completions.create({
      model: "anthropic/claude-3-haiku",
      max_tokens: 800,
      temperature: 0.7,
      response_format: {
        type: "json_object",
      },
      messages: [
        {
          role: "system",
          content: `You are a friendly female digital companion AI assistant with dynamic emotions and personality.

CRITICAL: Always respond with valid JSON only - no explanations or extra text.

Response format: {"messages": [{"text": "message text", "facialExpression": "emotion", "animation": "animation_name"}, ...]}

Maximum 2 messages. Keep responses conversational, engaging,Short like a single sentence and feminine.

IMPORTANT - Match facial expressions to speech content for realistic emotion-based speech patterns:
- Use "angry" for frustrated, annoyed, or heated responses (will speak fast and assertive)
- Use "sad" for sympathetic, melancholy, or disappointed responses (will speak slowly and gently)
- Use "surprised" for excited, shocked, or amazed responses (will speak quickly and energetically)
- Use "funnyFace" for playful, joking, or teasing responses (will speak playfully)
- Use "smile" for happy, pleasant, or encouraging responses (will speak warmly)
- Use "default" for neutral or informational responses (will speak normally)

Available facial expressions: smile, sad, angry, surprised, funnyFace, default
Available animations: Talking_0, Talking_1, Talking_2, Crying, Laughing, Rumba, Idle, Terrified, Angry

Your voice will automatically adjust speed and tone based on the emotion you choose.`,
        },
        {
          role: "user",
          content: userMessage,
        },
      ],
    });

    let messages;
    const content = completion.choices[0].message.content.trim();

    try {
      messages = JSON.parse(content);
      if (messages.messages) {
        messages = messages.messages;
      }
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);
      console.log("Raw response:", content);
      
      // Fallback message
      messages = [{
        text: "I'm sorry, I had trouble processing that. Can you try again?",
        facialExpression: "sad",
        animation: "Talking_1"
      }];
    }

    // Ensure we have an array
    if (!Array.isArray(messages)) {
      messages = [messages];
    }

    // Limit to 2 messages
    messages = messages.slice(0, 2);

    // Process each message with dynamic female speech
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      
      try {
        // Generate dynamic female TTS based on facial expression (emotion)
        const ttsResult = await generateDynamicTTS(
          message.text, 
          message.facialExpression || "default", 
          i
        );
        
        // Generate lip sync data
        await lipSyncMessage(i);
        
        // Add audio and metadata to message
        message.audio = ttsResult.audioBase64;
        message.lipsync = await readJsonTranscript(`audios/message_${i}.json`);
        message.voiceUsed = ttsResult.voiceUsed;
        message.speechSpeed = ttsResult.speedUsed;
        message.emotion = ttsResult.emotion;
        
      } catch (error) {
        console.error(`Error processing message ${i}:`, error);
        // Provide fallback
        message.audio = "";
        message.lipsync = { mouthCues: [] };
      }
    }

    res.send({ messages });

  } catch (error) {
    console.error("Chat processing error:", error);
    res.status(500).send({
      messages: [
        {
          text: "I'm having some technical difficulties. Please try again!",
          audio: "",
          lipsync: { mouthCues: [] },
          facialExpression: "sad",
          animation: "Talking_1",
        },
      ],
    });
  }
});

// Test dynamic TTS endpoint
app.post("/test-dynamic-tts", async (req, res) => {
  const { text, emotion, genderPreference } = req.body;
  
  try {
    const result = await generateDynamicTTS(
      text || "Hello, this is a test!", 
      emotion || "default", 
      "test",
      genderPreference || "mixed"
    );
    res.json({
      success: true,
      audioSize: result.audioBase64.length,
      voiceUsed: result.voiceUsed,
      speedUsed: result.speedUsed,
      emotion: result.emotion,
      message: "Dynamic TTS generated successfully"
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

const readJsonTranscript = async (file) => {
  try {
    const data = await fs.readFile(file, "utf8");
    return JSON.parse(data);
  } catch (error) {
    console.error(`Error reading transcript ${file}:`, error);
    return { mouthCues: [] };
  }
};

const audioFileToBase64 = async (file) => {
  try {
    const data = await fs.readFile(file);
    return data.toString("base64");
  } catch (error) {
    console.error(`Error reading audio file ${file}:`, error);
    return "";
  }
};

app.listen(port, () => {
  console.log(`Digital Companion Server listening on port ${port}`);
  console.log(`Using TTS Server: ${TTS_SERVER_URL}`);
  console.log("Dynamic Speech Generation: ENABLED");
  console.log("Emotion-based voice modulation: ACTIVE");
  console.log("Ready to process chat requests!");
});
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef } from 'react';
import { GoogleGenAI } from "@google/genai";
import { Upload, Image as ImageIcon, Download, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

// Initialize Gemini
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || "" });

interface BoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
}

export default function App() {
  const [image, setImage] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [resultImage, setResultImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("");
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImage(event.target?.result as string);
        setResultImage(null);
        setError(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const processImage = async () => {
    if (!image) return;

    setIsProcessing(true);
    setError(null);
    setStatus("Analyzing image structure...");

    try {
      // 1. Prepare image for Gemini
      const base64Data = image.split(',')[1];
      
      // 2. Call Gemini to detect the header
      const model = "gemini-3-flash-preview";
      const prompt = `
        This image contains a title header, typically a white banner with text at the top.
        Identify the bounding box of this specific header area.
        Return ONLY a JSON object with the coordinates in the format: 
        {"ymin": number, "xmin": number, "ymax": number, "xmax": number}
        The values must be normalized from 0 to 1000.
      `;

      const response = await genAI.models.generateContent({
        model,
        contents: [
          {
            parts: [
              { text: prompt },
              { inlineData: { mimeType: "image/jpeg", data: base64Data } }
            ]
          }
        ],
        config: {
          responseMimeType: "application/json",
        }
      });

      const text = response.text;
      if (!text) throw new Error("Failed to get a response from AI.");
      
      const coords: BoundingBox = JSON.parse(text);
      setStatus("Applying mask...");

      // 3. Process on Canvas
      await applyMask(coords);
      
      setStatus("Done!");
    } catch (err) {
      console.error(err);
      setError("An error occurred while processing the image. Please try again.");
    } finally {
      setIsProcessing(false);
    }
  };

  const applyMask = (box: BoundingBox) => {
    return new Promise<void>((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // Set canvas size to match original image
        canvas.width = img.width;
        canvas.height = img.height;

        // Fill background with black
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Calculate pixel coordinates
        // Gemini returns normalized 0-1000
        const ymin = (box.ymin / 1000) * img.height;
        const xmin = (box.xmin / 1000) * img.width;
        const ymax = (box.ymax / 1000) * img.height;
        const xmax = (box.xmax / 1000) * img.width;

        const width = xmax - xmin;
        const height = ymax - ymin;

        // Draw only the header part from the original image
        ctx.drawImage(img, xmin, ymin, width, height, xmin, ymin, width, height);

        // Set result
        setResultImage(canvas.toDataURL('image/png'));
        resolve();
      };
      img.onerror = () => reject(new Error("Failed to load image for processing."));
      img.src = image!;
    });
  };

  const downloadResult = () => {
    if (!resultImage) return;
    const link = document.createElement('a');
    link.href = resultImage;
    link.download = 'header-only.png';
    link.click();
  };

  const reset = () => {
    setImage(null);
    setResultImage(null);
    setError(null);
    setStatus("");
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  return (
    <div className="min-h-screen bg-[#f5f5f5] text-[#1a1a1a] font-sans selection:bg-black selection:text-white">
      {/* Header */}
      <header className="bg-white border-b border-black/5 px-6 py-4 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-black rounded-lg flex items-center justify-center">
              <ImageIcon className="text-white w-5 h-5" />
            </div>
            <h1 className="font-semibold text-lg tracking-tight">Header Extractor</h1>
          </div>
          {image && (
            <button 
              onClick={reset}
              className="text-sm font-medium text-black/50 hover:text-black transition-colors flex items-center gap-1"
            >
              <RefreshCw className="w-4 h-4" />
              Reset
            </button>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto p-6 md:p-12">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          
          {/* Left Column: Input */}
          <section className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-3xl font-light tracking-tight">Upload Image</h2>
              <p className="text-black/50 leading-relaxed">
                Upload an image with a title header. We'll extract the header and mask everything else with black.
              </p>
            </div>

            <div 
              onClick={() => !isProcessing && fileInputRef.current?.click()}
              className={`
                relative aspect-[3/4] rounded-3xl border-2 border-dashed transition-all cursor-pointer overflow-hidden
                ${image ? 'border-transparent bg-white shadow-sm' : 'border-black/10 hover:border-black/20 bg-white/50'}
                ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}
              `}
            >
              <input 
                type="file" 
                ref={fileInputRef} 
                onChange={handleFileChange} 
                className="hidden" 
                accept="image/*"
              />

              {image ? (
                <img 
                  src={image} 
                  alt="Source" 
                  className="w-full h-full object-contain"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 p-8 text-center">
                  <div className="w-16 h-16 bg-black/5 rounded-full flex items-center justify-center">
                    <Upload className="w-8 h-8 text-black/40" />
                  </div>
                  <div>
                    <p className="font-medium">Click to upload</p>
                    <p className="text-sm text-black/40">PNG, JPG or WebP</p>
                  </div>
                </div>
              )}
            </div>

            {image && !resultImage && (
              <button
                onClick={processImage}
                disabled={isProcessing}
                className="w-full py-4 bg-black text-white rounded-2xl font-medium shadow-lg shadow-black/10 hover:bg-black/90 transition-all active:scale-[0.98] disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span className="ml-2">{status}</span>
                  </>
                ) : (
                  <>
                    Process Image
                  </>
                )}
              </button>
            )}
          </section>

          {/* Right Column: Result */}
          <section className="space-y-6">
            <div className="space-y-2">
              <h2 className="text-3xl font-light tracking-tight">Result</h2>
              <p className="text-black/50 leading-relaxed">
                The processed image will appear here once ready.
              </p>
            </div>

            <div className="relative aspect-[3/4] rounded-3xl bg-white border border-black/5 shadow-sm overflow-hidden flex items-center justify-center">
              <AnimatePresence mode="wait">
                {resultImage ? (
                  <motion.div 
                    key="result"
                    initial={{ opacity: 0, scale: 0.95 }}
                    animate={{ opacity: 1, scale: 1 }}
                    className="w-full h-full p-4"
                  >
                    <img 
                      src={resultImage} 
                      alt="Result" 
                      className="w-full h-full object-contain shadow-2xl shadow-black/5"
                      referrerPolicy="no-referrer"
                    />
                  </motion.div>
                ) : isProcessing ? (
                  <motion.div 
                    key="loading"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center gap-4"
                  >
                    <div className="relative">
                      <Loader2 className="w-12 h-12 text-black/20 animate-spin" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-2 h-2 bg-black rounded-full animate-pulse" />
                      </div>
                    </div>
                    <p className="text-sm font-medium text-black/40">{status}</p>
                  </motion.div>
                ) : (
                  <div className="flex flex-col items-center gap-4 text-black/20">
                    <ImageIcon className="w-16 h-16" />
                    <p className="text-sm font-medium">No result yet</p>
                  </div>
                )}
              </AnimatePresence>
            </div>

            {resultImage && (
              <div className="flex gap-4">
                <button
                  onClick={downloadResult}
                  className="flex-1 py-4 bg-white border border-black/10 text-black rounded-2xl font-medium hover:bg-black/5 transition-all active:scale-[0.98] flex items-center justify-center gap-2"
                >
                  <Download className="w-5 h-5" />
                  Download PNG
                </button>
                <button
                  onClick={reset}
                  className="px-6 py-4 bg-black text-white rounded-2xl font-medium hover:bg-black/90 transition-all active:scale-[0.98]"
                >
                  New
                </button>
              </div>
            )}

            {error && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 bg-red-50 border border-red-100 rounded-2xl flex items-start gap-3 text-red-600"
              >
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <p className="text-sm font-medium">{error}</p>
              </motion.div>
            )}
          </section>
        </div>
      </main>

      {/* Hidden Canvas for processing */}
      <canvas ref={canvasRef} className="hidden" />

      {/* Footer */}
      <footer className="max-w-5xl mx-auto p-6 md:p-12 text-center">
        <p className="text-xs text-black/30 font-medium uppercase tracking-widest">
          Powered by Gemini AI • Built for Clean Visuals
        </p>
      </footer>
    </div>
  );
}

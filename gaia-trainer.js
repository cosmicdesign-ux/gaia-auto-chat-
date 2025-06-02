#!/usr/bin/env node

const WebSocket = require('ws');
const readline = require('readline');
const fs = require('fs').promises;
const path = require('path');
const { EventEmitter } = require('events');

class GaiaAiTrainingBot extends EventEmitter {
    constructor(config = {}) {
        super();
        this.config = {
            nodeUrl: config.nodeUrl || 'ws://localhost:8080/chat',
            trainingMode: config.trainingMode || 'general',
            messageInterval: config.messageInterval || 3000, // 3 seconds
            maxMessages: config.maxMessages || 50,
            customPrompts: config.customPrompts || [],
            logFile: config.logFile || `gaia-training-${new Date().toISOString().split('T')[0]}.json`,
            ...config
        };
        
        this.ws = null;
        this.isRunning = false;
        this.isPaused = false;
        this.stats = {
            messageCount: 0,
            sessionCount: 0,
            startTime: null,
            responses: 0,
            errors: 0
        };
        
        this.trainingData = [];
        this.currentPromptIndex = 0;
        
        this.setupSignalHandlers();
    }

    setupSignalHandlers() {
        process.on('SIGINT', () => {
            console.log('\n🛑 Shutting down gracefully...');
            this.stopTraining().then(() => {
                process.exit(0);
            });
        });
    }

    getTrainingPrompts() {
        const prompts = {
            general: [
                "Hello, how are you today?",
                "What's your favorite color and why?",
                "Tell me about the weather",
                "What do you think about artificial intelligence?",
                "Can you help me with a problem?",
                "What's the meaning of life?",
                "How do you stay motivated?",
                "What's your opinion on climate change?",
                "Tell me a joke",
                "What's your favorite book?",
                "How do you spend your free time?",
                "What makes you happy?",
                "Can you explain something complex in simple terms?",
                "What would you do if you could time travel?",
                "What's the most important lesson you've learned?"
            ],
            qa: [
                "What is machine learning?",
                "How does photosynthesis work?",
                "What are the benefits of renewable energy?",
                "Explain quantum computing",
                "What causes earthquakes?",
                "How do vaccines work?",
                "What is blockchain technology?",
                "Explain the theory of relativity",
                "What is DNA?",
                "How do computers process information?",
                "What is artificial neural networks?",
                "How does the internet work?",
                "What is climate change?",
                "Explain the water cycle",
                "What are black holes?"
            ],
            creative: [
                "Write a short story about a time traveler",
                "Create a poem about the ocean",
                "Describe a futuristic city",
                "Write a dialogue between two robots",
                "Create a character for a fantasy novel",
                "Write a song about friendship",
                "Describe a magical forest",
                "Create a superhero origin story",
                "Write a letter from the future",
                "Describe an alien civilization",
                "Imagine a world without gravity",
                "Create a story about a sentient AI",
                "Describe your dream house",
                "Write about a day in 2050",
                "Create a conversation between Earth and Mars"
            ],
            technical: [
                "Explain RESTful API design principles",
                "What are the differences between SQL and NoSQL?",
                "How does encryption work?",
                "Explain microservices architecture",
                "What is containerization with Docker?",
                "How do neural networks learn?",
                "What is version control with Git?",
                "Explain cloud computing concepts",
                "What are design patterns in programming?",
                "How does blockchain consensus work?",
                "What is GraphQL vs REST?",
                "Explain serverless architecture",
                "What are the principles of clean code?",
                "How does machine learning training work?",
                "What is DevOps and CI/CD?"
            ],
            educational: [
                "Teach me about the solar system",
                "Explain basic chemistry concepts",
                "What is the scientific method?",
                "How do plants grow?",
                "Explain the water cycle",
                "What is evolution?",
                "How do muscles work?",
                "Explain the food chain",
                "What causes seasons?",
                "How do we see colors?",
                "What is the structure of an atom?",
                "How does the brain work?",
                "What are the laws of physics?",
                "Explain cellular respiration",
                "What is genetic inheritance?"
            ],
            custom: this.config.customPrompts.length > 0 ? this.config.customPrompts : [
                "Tell me about your capabilities",
                "What can you help me with?",
                "How do you process information?"
            ]
        };
        
        return prompts[this.config.trainingMode] || prompts.general;
    }

    async connectToNode() {
        return new Promise((resolve, reject) => {
            console.log(`🔄 Connecting to GaiaAi node at ${this.config.nodeUrl}...`);
            
            this.ws = new WebSocket(this.config.nodeUrl);
            
            this.ws.on('open', () => {
                console.log('✅ Connected to GaiaAi node successfully');
                this.emit('connected');
                resolve();
            });
            
            this.ws.on('message', (data) => {
                try {
                    const response = JSON.parse(data.toString());
                    this.handleResponse(response);
                } catch (error) {
                    // Handle plain text responses
                    this.handleResponse({ message: data.toString() });
                }
            });
            
            this.ws.on('close', (code, reason) => {
                console.log(`🔴 Connection closed: ${code} - ${reason}`);
                this.emit('disconnected');
            });
            
            this.ws.on('error', (error) => {
                console.error('❌ WebSocket error:', error.message);
                this.stats.errors++;
                this.emit('error', error);
                reject(error);
            });
            
            // Connection timeout
            setTimeout(() => {
                if (this.ws.readyState !== WebSocket.OPEN) {
                    reject(new Error('Connection timeout'));
                }
            }, 10000);
        });
    }

    handleResponse(response) {
        this.stats.responses++;
        const message = response.message || response.content || response.text || 'Response received';
        
        console.log(`\n🤖 Bot Response [${this.stats.responses}]:`);
        console.log(`   ${message.substring(0, 100)}${message.length > 100 ? '...' : ''}`);
        
        this.trainingData.push({
            timestamp: new Date().toISOString(),
            type: 'response',
            content: message,
            session: this.stats.sessionCount
        });
        
        this.emit('response', response);
    }

    async sendMessage(message) {
        if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
            throw new Error('WebSocket not connected');
        }
        
        const messageObj = {
            type: 'chat',
            message: message,
            timestamp: new Date().toISOString(),
            session: this.stats.sessionCount
        };
        
        this.ws.send(JSON.stringify(messageObj));
        this.stats.messageCount++;
        
        console.log(`\n👤 Sent Message [${this.stats.messageCount}]:`);
        console.log(`   ${message}`);
        
        this.trainingData.push({
            timestamp: new Date().toISOString(),
            type: 'prompt',
            content: message,
            session: this.stats.sessionCount
        });
        
        this.emit('messageSent', message);
    }

    async startTraining() {
        try {
            console.log('\n🚀 Starting GaiaAi Training Bot...');
            console.log(`📋 Mode: ${this.config.trainingMode}`);
            console.log(`⏱️  Interval: ${this.config.messageInterval}ms`);
            console.log(`📊 Max Messages: ${this.config.maxMessages}`);
            
            await this.connectToNode();
            
            this.isRunning = true;
            this.stats.startTime = new Date();
            this.stats.sessionCount++;
            
            console.log('\n▶️  Training session started! Press Ctrl+C to stop gracefully.\n');
            
            await this.trainingLoop();
            
        } catch (error) {
            console.error('❌ Failed to start training:', error.message);
            throw error;
        }
    }

    async trainingLoop() {
        const prompts = this.getTrainingPrompts();
        let currentMessageCount = 0;
        
        while (this.isRunning && currentMessageCount < this.config.maxMessages) {
            if (this.isPaused) {
                await this.sleep(1000);
                continue;
            }
            
            try {
                // Get next prompt (cycle through prompts)
                const prompt = prompts[this.currentPromptIndex % prompts.length];
                this.currentPromptIndex++;
                
                await this.sendMessage(prompt);
                currentMessageCount++;
                
                // Show progress
                this.showProgress(currentMessageCount);
                
                // Wait before next message
                await this.sleep(this.config.messageInterval);
                
            } catch (error) {
                console.error('❌ Error in training loop:', error.message);
                this.stats.errors++;
                
                // Try to reconnect if connection lost
                if (error.message.includes('WebSocket')) {
                    console.log('🔄 Attempting to reconnect...');
                    try {
                        await this.connectToNode();
                    } catch (reconnectError) {
                        console.error('❌ Reconnection failed:', reconnectError.message);
                        break;
                    }
                }
            }
        }
        
        if (currentMessageCount >= this.config.maxMessages) {
            console.log('\n✅ Training session completed successfully!');
        }
        
        await this.stopTraining();
    }

    showProgress(current) {
        const percentage = Math.round((current / this.config.maxMessages) * 100);
        const elapsed = Date.now() - this.stats.startTime;
        const elapsedStr = this.formatDuration(elapsed);
        
        process.stdout.write(`\r📊 Progress: ${current}/${this.config.maxMessages} (${percentage}%) | Responses: ${this.stats.responses} | Elapsed: ${elapsedStr} | Errors: ${this.stats.errors}`);
    }

    formatDuration(ms) {
        const seconds = Math.floor(ms / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        
        if (hours > 0) {
            return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
        } else if (minutes > 0) {
            return `${minutes}m ${seconds % 60}s`;
        } else {
            return `${seconds}s`;
        }
    }

    async stopTraining() {
        this.isRunning = false;
        this.isPaused = false;
        
        if (this.ws) {
            this.ws.close();
        }
        
        console.log('\n\n🛑 Training stopped');
        await this.saveLogs();
        this.printSummary();
    }

    pauseTraining() {
        this.isPaused = !this.isPaused;
        console.log(this.isPaused ? '\n⏸️  Training paused' : '\n▶️  Training resumed');
    }

    async saveLogs() {
        try {
            const logData = {
                config: this.config,
                stats: {
                    ...this.stats,
                    endTime: new Date(),
                    duration: Date.now() - this.stats.startTime
                },
                trainingData: this.trainingData
            };
            
            const logPath = path.resolve(this.config.logFile);
            await fs.writeFile(logPath, JSON.stringify(logData, null, 2));
            console.log(`💾 Training logs saved to: ${logPath}`);
            
        } catch (error) {
            console.error('❌ Failed to save logs:', error.message);
        }
    }

    printSummary() {
        const duration = this.stats.startTime ? Date.now() - this.stats.startTime : 0;
        
        console.log('\n📊 Training Session Summary:');
        console.log('================================');
        console.log(`📤 Messages Sent: ${this.stats.messageCount}`);
        console.log(`📥 Responses Received: ${this.stats.responses}`);
        console.log(`🎯 Success Rate: ${this.stats.messageCount > 0 ? Math.round((this.stats.responses / this.stats.messageCount) * 100) : 0}%`);
        console.log(`⚠️  Errors: ${this.stats.errors}`);
        console.log(`⏱️  Duration: ${this.formatDuration(duration)}`);
        console.log(`📋 Training Mode: ${this.config.trainingMode}`);
        console.log(`🔗 Node URL: ${this.config.nodeUrl}`);
        console.log('================================\n');
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

// CLI Interface
class CLI {
    constructor() {
        this.rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
    }

    async prompt(question) {
        return new Promise(resolve => {
            this.rl.question(question, resolve);
        });
    }

    async getConfig() {
        console.log('🤖 GaiaAi Training Bot Configuration\n');
        
        const nodeUrl = await this.prompt('Node URL (ws://localhost:8080/chat): ') || 'ws://localhost:8080/chat';
        
        console.log('\nTraining Modes:');
        console.log('1. General conversation');
        console.log('2. Question & Answer');
        console.log('3. Creative writing');
        console.log('4. Technical discussion');
        console.log('5. Educational content');
        console.log('6. Custom prompts');
        
        const modeChoice = await this.prompt('\nSelect training mode (1-6): ') || '1';
        const modes = ['general', 'general', 'qa', 'creative', 'technical', 'educational', 'custom'];
        const trainingMode = modes[parseInt(modeChoice)] || 'general';
        
        let customPrompts = [];
        if (trainingMode === 'custom') {
            console.log('\nEnter custom prompts (one per line, empty line to finish):');
            let prompt;
            while ((prompt = await this.prompt('> ')) !== '') {
                customPrompts.push(prompt);
            }
        }
        
        const messageInterval = parseInt(await this.prompt('Message interval in seconds (3): ') || '3') * 1000;
        const maxMessages = parseInt(await this.prompt('Max messages per session (50): ') || '50');
        
        this.rl.close();
        
        return {
            nodeUrl,
            trainingMode,
            customPrompts,
            messageInterval,
            maxMessages
        };
    }
}

// Main execution
async function main() {
    try {
        // Check if config provided via command line arguments
        if (process.argv.includes('--help') || process.argv.includes('-h')) {
            console.log('🤖 GaiaAi Training Bot');
            console.log('\nUsage:');
            console.log('  node gaia-trainer.js [options]');
            console.log('\nOptions:');
            console.log('  --url <url>        Node WebSocket URL');
            console.log('  --mode <mode>      Training mode (general|qa|creative|technical|educational|custom)');
            console.log('  --interval <sec>   Message interval in seconds');
            console.log('  --max <num>        Maximum messages per session');
            console.log('  --help, -h         Show this help message');
            console.log('\nExample:');
            console.log('  node gaia-trainer.js --url ws://localhost:8080/chat --mode qa --interval 5 --max 100');
            return;
        }
        
        let config = {};
        
        // Parse command line arguments
        const args = process.argv.slice(2);
        for (let i = 0; i < args.length; i += 2) {
            switch (args[i]) {
                case '--url':
                    config.nodeUrl = args[i + 1];
                    break;
                case '--mode':
                    config.trainingMode = args[i + 1];
                    break;
                case '--interval':
                    config.messageInterval = parseInt(args[i + 1]) * 1000;
                    break;
                case '--max':
                    config.maxMessages = parseInt(args[i + 1]);
                    break;
            }
        }
        
        // If no config provided, use interactive CLI
        if (Object.keys(config).length === 0) {
            const cli = new CLI();
            config = await cli.getConfig();
        }
        
        const bot = new GaiaAiTrainingBot(config);
        await bot.startTraining();
        
    } catch (error) {
        console.error('❌ Fatal error:', error.message);
        process.exit(1);
    }
}

// Export for use as module
module.exports = { GaiaAiTrainingBot, CLI };

// Run if called directly
if (require.main === module) {
    main();
}
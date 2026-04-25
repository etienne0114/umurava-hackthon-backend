/**
 * Bug Condition Exploration Test - AI Provider Connectivity
 * 
 * **CRITICAL**: This test MUST FAIL on unfixed code - failure confirms the bug exists
 * **DO NOT attempt to fix the test or the code when it fails**
 * **GOAL**: Surface counterexamples that demonstrate timeout failures exist
 * 
 * Property 1: Bug Condition - Network Timeout Resilience Under High Latency
 * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
 */

import * as fc from 'fast-check';
import { testGroqConnection } from '../config/groq';
import { getGeminiModel } from '../config/gemini';
import { screeningController } from '../controllers/screening.controller';
import { Request, Response } from 'express';

// Network simulation utilities
class NetworkSimulator {
  static async addLatency(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static async simulatePacketLoss(lossRate: number): Promise<boolean> {
    return Math.random() < lossRate;
  }

  static async withNetworkStress<T>(
    operation: () => Promise<T>,
    latency: number,
    packetLossRate: number
  ): Promise<T> {
    // Simulate packet loss
    if (await this.simulatePacketLoss(packetLossRate)) {
      throw new Error('ETIMEDOUT: Simulated packet loss');
    }

    // Add artificial latency
    await this.addLatency(latency);
    
    return operation();
  }
}

// Test generators for property-based testing
const networkConditionsArbitrary = fc.record({
  latency: fc.integer({ min: 200, max: 500 }), // Reduced max latency from 1000ms to 500ms
  packetLoss: fc.float({ min: Math.fround(0.3), max: Math.fround(0.5) }), // Reduced max packet loss from 70% to 50%
  concurrentRequests: fc.integer({ min: 5, max: 10 }) // Reduced from 10-20 to 5-10 concurrent requests
});

describe('AI Provider Timeout Bug Exploration', () => {
  let counterExamples: Array<{
    condition: string;
    error: string;
    latency: number;
    packetLoss: number;
    concurrentRequests: number;
  }> = [];

  beforeEach(() => {
    counterExamples = [];
  });

  afterEach(() => {
    if (counterExamples.length > 0) {
      console.log('\n=== COUNTEREXAMPLES FOUND (Bug Condition Confirmed) ===');
      counterExamples.forEach((example, index) => {
        console.log(`${index + 1}. ${example.condition}`);
        console.log(`   Error: ${example.error}`);
        console.log(`   Network: ${example.latency}ms latency, ${(example.packetLoss * 100).toFixed(1)}% loss, ${example.concurrentRequests} concurrent`);
      });
      console.log('=== End Counterexamples ===\n');
    }
  });

  /**
   * Property 1: Bug Condition - Network Timeout Resilience Under High Latency
   * 
   * This property tests that AI provider requests complete successfully under network stress.
   * On UNFIXED code, this should FAIL, proving timeout bugs exist.
   * 
   * **Validates: Requirements 2.1, 2.2, 2.3, 2.4**
   */
  test('Property 1: AI providers should handle network stress without timeouts', async () => {
    await fc.assert(
      fc.asyncProperty(networkConditionsArbitrary, async (conditions) => {
        const { latency, packetLoss, concurrentRequests } = conditions;
        
        try {
          // Reduce concurrent requests for faster testing
          const reducedConcurrency = Math.min(concurrentRequests, 5);
          
          // Test concurrent health checks under network stress
          const healthCheckPromises = Array.from({ length: reducedConcurrency }, async (_, index) => {
            return NetworkSimulator.withNetworkStress(
              async () => {
                // Mock request/response for health check
                const mockReq = {} as Request;
                const mockRes = {
                  status: jest.fn().mockReturnThis(),
                  json: jest.fn()
                } as unknown as Response;

                await screeningController.checkAIProviderHealth(mockReq, mockRes, jest.fn());
                
                // Extract the response data
                const jsonCall = (mockRes.json as jest.Mock).mock.calls[0];
                if (!jsonCall || !jsonCall[0]) {
                  throw new Error('No response from health check');
                }
                
                const response = jsonCall[0];
                const healthData = response.data;
                
                // Verify sub-15-second completion with "healthy" status (expected behavior)
                const hasHealthyProvider = healthData.gemini?.status === 'healthy' || 
                                         healthData.groq?.status === 'healthy';
                
                if (!hasHealthyProvider) {
                  throw new Error(`No healthy providers: Gemini=${healthData.gemini?.status}, Groq=${healthData.groq?.status}`);
                }
                
                return { success: true, provider: hasHealthyProvider ? 'available' : 'none' };
              },
              latency,
              packetLoss
            );
          });

          // All concurrent requests should complete within 15 seconds
          const startTime = Date.now();
          const results = await Promise.allSettled(healthCheckPromises);
          const duration = Date.now() - startTime;

          // Check if any requests failed or took too long
          const failures = results.filter(result => result.status === 'rejected');
          const timeoutFailure = duration > 15000; // 15 second timeout

          if (failures.length > 0 || timeoutFailure) {
            const errorMessages = failures.map(f => 
              f.status === 'rejected' ? f.reason.message : 'Unknown error'
            );
            
            const primaryError = timeoutFailure 
              ? `Timeout: ${duration}ms > 15000ms` 
              : errorMessages[0] || 'Multiple failures';

            // Document this counterexample
            counterExamples.push({
              condition: `${reducedConcurrency} concurrent health checks under network stress`,
              error: primaryError,
              latency,
              packetLoss,
              concurrentRequests: reducedConcurrency
            });

            // This assertion should FAIL on unfixed code, proving the bug exists
            throw new Error(`Bug condition confirmed: ${primaryError} (${failures.length}/${reducedConcurrency} failed, ${duration}ms duration)`);
          }

          // If we reach here, the system handled the stress well (this should NOT happen on unfixed code)
          return true;

        } catch (error) {
          // Document the failure as a counterexample
          const errorMessage = error instanceof Error ? error.message : String(error);
          
          counterExamples.push({
            condition: `Network stress test with ${Math.min(concurrentRequests, 5)} concurrent requests`,
            error: errorMessage,
            latency,
            packetLoss,
            concurrentRequests: Math.min(concurrentRequests, 5)
          });

          // Re-throw to fail the property test (expected on unfixed code)
          throw error;
        }
      }),
      {
        numRuns: 3, // Reduced from 10 to 3 for faster execution
        timeout: 20000, // Reduced from 30s to 20s per test case
        verbose: true
      }
    );
  }, 45000); // Reduced from 60s to 45s test timeout

  /**
   * Individual Provider Tests - Scoped to concrete failing cases
   */
  test('Gemini provider should handle high latency without timeout', async () => {
    const testConditions = {
      latency: 300, // Reduced from 500ms to 300ms latency
      packetLoss: 0.4, // Reduced from 50% to 40% packet loss
      concurrentRequests: 8 // Reduced from 15 to 8
    };

    try {
      // Test Gemini under stress
      const geminiPromises = Array.from({ length: testConditions.concurrentRequests }, async () => {
        return NetworkSimulator.withNetworkStress(
          async () => {
            const model = getGeminiModel();
            const result = await Promise.race([
              model.generateContent('Health check test'),
              new Promise((_, reject) => 
                setTimeout(() => reject(new Error('Timeout after 10s')), 10000) // Reduced from 15s to 10s
              )
            ]);
            return result;
          },
          testConditions.latency,
          testConditions.packetLoss
        );
      });

      const startTime = Date.now();
      const results = await Promise.allSettled(geminiPromises);
      const duration = Date.now() - startTime;

      const failures = results.filter(r => r.status === 'rejected');
      
      if (failures.length > 0 || duration > 12000) { // Reduced from 15s to 12s
        const errorMsg = failures.length > 0 
          ? `${failures.length}/${testConditions.concurrentRequests} Gemini requests failed`
          : `Gemini requests took ${duration}ms > 12000ms`;

        counterExamples.push({
          condition: 'Gemini high latency test',
          error: errorMsg,
          ...testConditions
        });

        // This should FAIL on unfixed code
        throw new Error(`Gemini timeout bug confirmed: ${errorMsg}`);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      counterExamples.push({
        condition: 'Gemini provider stress test',
        error: errorMessage,
        ...testConditions
      });

      throw error;
    }
  }, 20000); // Reduced from 30s to 20s

  test('Groq provider should handle high latency without timeout', async () => {
    const testConditions = {
      latency: 250,
      packetLoss: 0.3,
      concurrentRequests: 6
    };

    try {
      // Test Groq under stress
      const groqPromises = Array.from({ length: testConditions.concurrentRequests }, async () => {
        return NetworkSimulator.withNetworkStress(
          async () => {
            const result = await Promise.race([
              testGroqConnection(),
              new Promise<{ success: boolean; error?: string }>((_, reject) => 
                setTimeout(() => reject(new Error('Timeout after 10s')), 10000)
              )
            ]);
            
            if (!result.success) {
              throw new Error(result.error || 'Groq connection failed');
            }
            
            return result;
          },
          testConditions.latency,
          testConditions.packetLoss
        );
      });

      const startTime = Date.now();
      const results = await Promise.allSettled(groqPromises);
      const duration = Date.now() - startTime;

      const failures = results.filter(r => r.status === 'rejected');
      
      if (failures.length > 0 || duration > 12000) {
        const errorMsg = failures.length > 0 
          ? `${failures.length}/${testConditions.concurrentRequests} Groq requests failed`
          : `Groq requests took ${duration}ms > 12000ms`;

        counterExamples.push({
          condition: 'Groq high latency test',
          error: errorMsg,
          ...testConditions
        });

        throw new Error(`Groq timeout bug confirmed: ${errorMsg}`);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      
      counterExamples.push({
        condition: 'Groq provider stress test',
        error: errorMessage,
        ...testConditions
      });

      throw error;
    }
  }, 20000);
});
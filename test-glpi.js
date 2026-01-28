// Test script to verify GLPI client functionality
import { getInstanceEnvs, fetchTicketsForInstance } from './src/lib/glpi/index.js';

console.log('Testing GLPI client setup...');

try {
  const instances = getInstanceEnvs();
  console.log('Found instances:', instances.map(i => i.instance));
  
  for (const instance of instances) {
    console.log(`\n=== Testing ${instance.instance} ===`);
    try {
      const tickets = await fetchTicketsForInstance(instance);
      console.log(`✅ Success: Found ${tickets.length} tickets`);
    } catch (error) {
      console.log(`❌ Failed: ${error.message}`);
    }
  }
} catch (error) {
  console.error('Setup error:', error.message);
}

// Let's manually see what tsc is doing
import { exec } from 'child_process';
import { promisify } from 'util';
const execAsync = promisify(exec);

async function test() {
  try {
    const { stdout, stderr } = await execAsync('npx tsc --outDir dist --rootDir src --target ES2022 --module NodeNext --moduleResolution NodeNext --declaration --declarationMap src/index.ts', { cwd: __dirname });
    console.log('stdout:', stdout);
    console.error('stderr:', stderr);
  } catch (err) {
    console.error('Error:', err);
  }
}

test();

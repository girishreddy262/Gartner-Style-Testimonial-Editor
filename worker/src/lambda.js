// Invoke AWS Lambda from a Cloudflare Worker.
// Calls the Remotion Lambda function which handles render start, progress, etc.

import { sigV4Sign } from './aws.js';

export async function invokeLambda(env, payload) {
  const functionName = env.REMOTION_LAMBDA_FUNCTION;
  const region = env.AWS_REGION;
  const url = `https://lambda.${region}.amazonaws.com/2015-03-31/functions/${functionName}/invocations`;

  const body = JSON.stringify(payload);

  const req = await sigV4Sign(env, {
    method: 'POST',
    url,
    headers: {
      'content-type': 'application/x-amz-json-1.0'
    },
    body,
    service: 'lambda',
    region
  });

  const res = await fetch(req);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Lambda invoke failed: ${res.status} ${text.slice(0, 300)}`);
  }
  return res.json();
}

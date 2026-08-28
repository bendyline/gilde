import assert from 'node:assert/strict';
import { test } from 'node:test';
import { lintChatModelManifest } from '../lint-models.mjs';

/**
 * The `name-omits-quantization` rule. A user picking between two installs
 * of the same weights sees only the title and the size, so a title that
 * leaves the width out makes the two rows look like the same model at two
 * sizes for no stated reason.
 */
function nameFinding(name, quantization) {
  const report = lintChatModelManifest({
    id: 'test-model',
    name,
    llamaCpp: { quantization },
  });
  return report.errors.find((f) => f.rule === 'name-omits-quantization') ?? null;
}

test('accepts every spelling a title legitimately uses for its width', () => {
  for (const [name, quantization] of [
    ['Qwen 3.5 (9B, Q4)', 'Q4_K_M'],
    ['Gemma 4 (12B, Q8)', 'Q8_0'],
    ['Laguna S 2.1 (118B-A8B, Q6 MLX)', '6bit'],
    ['BTL-4 Compact (35B-A3B, IQ2_XXS)', 'IQ2_XXS'],
    ['Ternary Bonsai 27B (2-bit)', 'UD-Q2_K_XL'],
    ['DeepSeek V4 Flash (mixed 2/4-bit)', 'IQ2_XXS'],
    ['DeepSeek V4 Flash (MXFP4)', 'MXFP4'],
    ['DeepSeek V4 Flash (FP4)', 'Q4_K_M'],
  ]) {
    assert.equal(nameFinding(name, quantization), null, `${name} / ${quantization}`);
  }
});

test('flags a title that leaves the width out', () => {
  assert.match(nameFinding('Qwen 3.5 (9B)', 'Q4_K_M').detail, /does not state its Q4/);
  assert.match(nameFinding('Mistral 7B Instruct', 'Q4_K_M').detail, /does not state its Q4/);
});

// `IQ2_XXS` must not read as `Q2`: an IQ title is the stricter claim and a
// plain "Q2" in a name should not satisfy an IQ2 manifest by accident.
test('reads IQ labels as IQ, not as the plain width they contain', () => {
  assert.equal(nameFinding('Model (IQ2_XXS)', 'IQ2_XXS'), null);
  assert.notEqual(nameFinding('Model (Q2)', 'IQ2_XXS'), null);
});

// The catalog tag is hand-authored content: `muse-glimmer-30b-q4` shipped
// `K-Quant-17GB`. A tag that names no width cannot be required in a name.
test('stays silent when the manifest label names no width', () => {
  assert.equal(nameFinding('Muse Glimmer (30B)', 'K-Quant-17GB'), null);
  assert.equal(nameFinding('Muse Glimmer (30B)', undefined), null);
});

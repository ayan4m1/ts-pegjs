import type { Config } from 'peggy';
import { generateParser } from './passes/generate-ts';
import { TsPegjsParserBuildOptions, ITsPegjs } from './types';

export class TsPegjs implements ITsPegjs {
  use(config: Config, options: TsPegjsParserBuildOptions) {
    // We depend on the code generated being an IIF
    (options as any).format = 'bare';

    config.passes.generate.push(generateParser);

    if (!options.tspegjs) {
      options.tspegjs = {};
    }
    if (options.tspegjs.customHeader === undefined) {
      options.tspegjs.customHeader = null;
    }
  }
}

import { registerDetector } from './index'
import { stuckPage } from './stuck-page'
import { lostKeyword } from './lost-keyword'
import { zeroImpressionPost } from './zero-impression-post'
import { unindexedPage } from './unindexed-page'
import { directorySilence } from './directory-silence'
import { cwvRegression } from './cwv-regression'
import { keywordMisalignment } from './keyword-misalignment'
import { pillarOrphan } from './pillar-orphan'
import { compoundStagnation } from './compound-stagnation'

let registered = false

export function registerAllDetectors() {
  if (registered) return
  registered = true
  registerDetector('stuck_page', stuckPage)
  registerDetector('lost_keyword', lostKeyword)
  registerDetector('zero_impression_post', zeroImpressionPost)
  registerDetector('unindexed_page', unindexedPage)
  registerDetector('directory_silence', directorySilence)
  registerDetector('cwv_regression', cwvRegression)
  registerDetector('keyword_misalignment', keywordMisalignment)
  registerDetector('pillar_orphan', pillarOrphan)
  registerDetector('compound_stagnation', compoundStagnation)
}

// Auto-register on import
registerAllDetectors()

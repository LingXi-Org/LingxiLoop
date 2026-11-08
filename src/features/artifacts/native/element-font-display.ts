import {displayFontFamily} from '../../../../shared/artifact-font-families'
import {editorFontChoice} from './editor-fonts'

/** Design按钮与来源菜单使用同一显示名；不改变作者字体声明或选择语义。 */
export function elementFontChoice(family:string|undefined){return editorFontChoice(displayFontFamily(family??''))}

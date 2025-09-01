// 角色中心统一入口
// 整合所有模块，提供统一的对外接口

// 类型定义
export * from './types/PersonaTypes.js';
export * from './types/ComponentTypes.js';

// 服务层
export { PersonaService } from './services/PersonaService.js';
export { UserRoleService } from './services/UserRoleService.js';
export { CompositionService } from './services/CompositionService.js';
export { ImportExportService } from './services/ImportExportService.js';

// UI组件
export { PersonaListComponent } from './components/PersonaList.js';
export { PersonaDetailComponent } from './components/PersonaDetail.js';

// 主屏幕控制器
export { PersonaCenterScreen } from './PersonaCenterScreen.js';

// 便捷工厂函数
import { PersonaCenterScreen } from './PersonaCenterScreen.js';

export function createPersonaCenterScreen(container: HTMLElement): PersonaCenterScreen {
  return new PersonaCenterScreen(container);
}

// 默认导出主控制器
export default PersonaCenterScreen;
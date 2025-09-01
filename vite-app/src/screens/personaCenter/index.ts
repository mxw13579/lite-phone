// 角色中心统一入口
// 整合所有模块，提供统一的对外接口

// 类型定义
export * from './types/PersonaTypes';
export * from './types/ComponentTypes';

// 服务层
export { PersonaService } from './services/PersonaService';
export { UserRoleService } from './services/UserRoleService';
export { CompositionService } from './services/CompositionService';
export { ImportExportService } from './services/ImportExportService';

// UI组件
export { PersonaListComponent } from './components/PersonaList';
export { PersonaDetailComponent } from './components/PersonaDetail';

// 主屏幕控制器
export { PersonaCenterScreen } from './PersonaCenterScreen';

// 便捷工厂函数
import { PersonaCenterScreen } from './PersonaCenterScreen';

export function createPersonaCenterScreen(container: HTMLElement): PersonaCenterScreen {
  return new PersonaCenterScreen(container);
}

// 默认导出主控制器
export default PersonaCenterScreen;
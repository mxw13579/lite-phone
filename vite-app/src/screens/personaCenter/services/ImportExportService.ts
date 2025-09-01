// 导入导出服务
// 处理Persona和UserRole的导入导出功能

import type { 
  Persona, 
  UserRole, 
  PersonaExportData, 
  ImportResult, 
  ConflictStrategy,
  ImportExportMeta
} from '../types/PersonaTypes';

import { PersonaService } from './PersonaService';
import { UserRoleService } from './UserRoleService';

export class ImportExportService {
  private personaService: PersonaService;
  private userRoleService: UserRoleService;

  constructor() {
    this.personaService = new PersonaService();
    this.userRoleService = new UserRoleService();
  }

  // 导出Personas
  async exportPersonas(personaIds?: string[]): Promise<string> {
    try {
      let personas: Persona[];
      
      if (personaIds && personaIds.length > 0) {
        // 导出指定的Personas
        const promises = personaIds.map(id => this.personaService.getById(id));
        const results = await Promise.all(promises);
        personas = results.filter((p): p is Persona => p !== null);
      } else {
        // 导出所有Personas
        personas = await this.personaService.getAll();
      }

      const exportData: PersonaExportData = {
        meta: {
          schemaVersion: 1,
          entityType: 'persona',
          exportedAt: Date.now(),
          sourceApp: 'EPhone',
          appVersion: '1.0.0' // 可以从package.json获取
        },
        personas
      };

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('导出Personas失败:', error);
      throw new Error('导出角色失败');
    }
  }

  // 导出UserRoles
  async exportUserRoles(userRoleIds?: string[]): Promise<string> {
    try {
      let userRoles: UserRole[];
      
      if (userRoleIds && userRoleIds.length > 0) {
        // 导出指定的UserRoles
        const promises = userRoleIds.map(id => this.userRoleService.getById(id));
        const results = await Promise.all(promises);
        userRoles = results.filter((ur): ur is UserRole => ur !== null);
      } else {
        // 导出所有UserRoles
        userRoles = await this.userRoleService.getAll();
      }

      const exportData: PersonaExportData = {
        meta: {
          schemaVersion: 1,
          entityType: 'userRole',
          exportedAt: Date.now(),
          sourceApp: 'EPhone',
          appVersion: '1.0.0'
        },
        userRoles
      };

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('导出UserRoles失败:', error);
      throw new Error('导出用户角色失败');
    }
  }

  // 导出混合数据
  async exportAll(personaIds?: string[], userRoleIds?: string[]): Promise<string> {
    try {
      let personas: Persona[] = [];
      let userRoles: UserRole[] = [];

      if (personaIds && personaIds.length > 0) {
        const promises = personaIds.map(id => this.personaService.getById(id));
        const results = await Promise.all(promises);
        personas = results.filter((p): p is Persona => p !== null);
      } else {
        personas = await this.personaService.getAll();
      }

      if (userRoleIds && userRoleIds.length > 0) {
        const promises = userRoleIds.map(id => this.userRoleService.getById(id));
        const results = await Promise.all(promises);
        userRoles = results.filter((ur): ur is UserRole => ur !== null);
      } else {
        userRoles = await this.userRoleService.getAll();
      }

      const exportData: PersonaExportData = {
        meta: {
          schemaVersion: 1,
          entityType: 'mixed',
          exportedAt: Date.now(),
          sourceApp: 'EPhone',
          appVersion: '1.0.0'
        },
        personas,
        userRoles
      };

      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('导出全部数据失败:', error);
      throw new Error('导出数据失败');
    }
  }

  // 下载导出文件
  downloadExport(data: string, filename: string): void {
    try {
      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      console.log('导出文件已下载:', filename);
    } catch (error) {
      console.error('下载导出文件失败:', error);
      throw new Error('下载文件失败');
    }
  }

  // 导入数据
  async import(file: File, strategy: ConflictStrategy = 'preserve'): Promise<ImportResult> {
    const result: ImportResult = {
      success: true,
      imported: { personas: 0, userRoles: 0 },
      skipped: { personas: 0, userRoles: 0 },
      errors: []
    };

    try {
      const text = await file.text();
      let importData: PersonaExportData;

      try {
        importData = JSON.parse(text);
      } catch (parseError) {
        throw new Error('文件格式无效：不是有效的JSON文件');
      }

      // 验证导入数据格式
      if (!this.validateImportData(importData)) {
        throw new Error('文件格式无效：缺少必要的字段或格式不正确');
      }

      // 导入Personas
      if (importData.personas && importData.personas.length > 0) {
        const personaResult = await this.importPersonas(importData.personas, strategy);
        result.imported.personas = personaResult.imported;
        result.skipped.personas = personaResult.skipped;
        result.errors.push(...personaResult.errors);
      }

      // 导入UserRoles
      if (importData.userRoles && importData.userRoles.length > 0) {
        const userRoleResult = await this.importUserRoles(importData.userRoles, strategy);
        result.imported.userRoles = userRoleResult.imported;
        result.skipped.userRoles = userRoleResult.skipped;
        result.errors.push(...userRoleResult.errors);
      }

      result.success = result.errors.length === 0;
      return result;
    } catch (error) {
      console.error('导入失败:', error);
      result.success = false;
      result.errors.push(error instanceof Error ? error.message : '导入过程中发生未知错误');
      return result;
    }
  }

  // 导入Personas
  private async importPersonas(personas: Persona[], strategy: ConflictStrategy): Promise<{
    imported: number;
    skipped: number;
    errors: string[];
  }> {
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    const existingPersonas = await this.personaService.getAll();
    const existingIds = new Set(existingPersonas.map(p => p.id));
    const existingNames = new Set(existingPersonas.map(p => p.name));

    for (const persona of personas) {
      try {
        let shouldImport = true;
        let finalPersona = { ...persona };

        if (existingIds.has(persona.id)) {
          switch (strategy) {
            case 'preserve':
              // 跳过已存在的
              skipped++;
              shouldImport = false;
              break;
            case 'override':
              // 覆盖现有的
              break;
            case 'regenId':
              // 生成新ID
              finalPersona.id = 'persona_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
              if (existingNames.has(persona.name)) {
                finalPersona.name = `${persona.name} (导入)`;
              }
              break;
          }
        } else if (existingNames.has(persona.name) && strategy === 'preserve') {
          // 名称冲突时重命名
          finalPersona.name = `${persona.name} (导入)`;
        }

        if (shouldImport) {
          // 验证数据
          const validation = this.personaService.validatePersona(finalPersona);
          if (!validation.isValid) {
            errors.push(`Persona "${persona.name}": ${validation.errors.join(', ')}`);
            continue;
          }

          // 保存（create会处理ID冲突）
          if (strategy === 'override' && existingIds.has(finalPersona.id)) {
            await this.personaService.update(finalPersona.id, finalPersona);
          } else {
            await this.personaService.create(finalPersona);
          }
          
          imported++;
        }
      } catch (error) {
        console.error(`导入Persona失败 ${persona.name}:`, error);
        errors.push(`Persona "${persona.name}": 导入失败`);
      }
    }

    return { imported, skipped, errors };
  }

  // 导入UserRoles
  private async importUserRoles(userRoles: UserRole[], strategy: ConflictStrategy): Promise<{
    imported: number;
    skipped: number;
    errors: string[];
  }> {
    let imported = 0;
    let skipped = 0;
    const errors: string[] = [];

    const existingUserRoles = await this.userRoleService.getAll();
    const existingIds = new Set(existingUserRoles.map(ur => ur.id));
    const existingNames = new Set(existingUserRoles.map(ur => ur.name));

    for (const userRole of userRoles) {
      try {
        let shouldImport = true;
        let finalUserRole = { ...userRole };

        // 导入的UserRole不能是全局默认（除非是覆盖策略）
        if (strategy !== 'override') {
          finalUserRole.isGlobalDefault = false;
        }

        if (existingIds.has(userRole.id)) {
          switch (strategy) {
            case 'preserve':
              skipped++;
              shouldImport = false;
              break;
            case 'override':
              break;
            case 'regenId':
              finalUserRole.id = 'user_role_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
              finalUserRole.isGlobalDefault = false; // 新生成的不能是默认
              if (existingNames.has(userRole.name)) {
                finalUserRole.name = `${userRole.name} (导入)`;
              }
              break;
          }
        } else if (existingNames.has(userRole.name) && strategy === 'preserve') {
          finalUserRole.name = `${userRole.name} (导入)`;
        }

        if (shouldImport) {
          // 验证数据
          const validation = this.userRoleService.validateUserRole(finalUserRole);
          if (!validation.isValid) {
            errors.push(`UserRole "${userRole.name}": ${validation.errors.join(', ')}`);
            continue;
          }

          // 保存
          if (strategy === 'override' && existingIds.has(finalUserRole.id)) {
            await this.userRoleService.update(finalUserRole.id, finalUserRole);
          } else {
            await this.userRoleService.create(finalUserRole);
          }
          
          imported++;
        }
      } catch (error) {
        console.error(`导入UserRole失败 ${userRole.name}:`, error);
        errors.push(`UserRole "${userRole.name}": 导入失败`);
      }
    }

    return { imported, skipped, errors };
  }

  // 验证导入数据格式
  private validateImportData(data: any): data is PersonaExportData {
    if (!data || typeof data !== 'object') return false;
    if (!data.meta || typeof data.meta !== 'object') return false;
    if (!data.meta.schemaVersion || !data.meta.entityType || !data.meta.exportedAt) return false;

    // 检查是否有数据
    const hasPersonas = Array.isArray(data.personas) && data.personas.length > 0;
    const hasUserRoles = Array.isArray(data.userRoles) && data.userRoles.length > 0;

    return hasPersonas || hasUserRoles;
  }

  // 生成导出文件名
  generateFilename(type: 'persona' | 'userRole' | 'mixed', count?: number): string {
    const timestamp = new Date().toISOString().slice(0, 10);
    const typeLabel = {
      persona: 'personas',
      userRole: 'userRoles',
      mixed: 'persona_center'
    }[type];
    
    const countSuffix = count !== undefined ? `_${count}` : '';
    return `${typeLabel}${countSuffix}_${timestamp}.json`;
  }
}
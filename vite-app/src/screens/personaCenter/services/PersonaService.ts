// Persona业务服务层
// 封装Persona相关的业务逻辑和数据操作

import type { 
  Persona, 
  CreatePersonaInput, 
  UpdatePersonaInput, 
  FilterOptions, 
  SearchOptions 
} from '../types/PersonaTypes.js';

// 导入数据库操作函数
import { 
  getAllPersonas, 
  getPersonaById, 
  savePersona, 
  deletePersona, 
  searchPersonas,
  updatePersonaLastUsedAt 
} from '../../../database/index.js';

// 导入状态管理函数
import {
  setPersonas,
  addPersona,
  updatePersona as updatePersonaState,
  removePersona,
  setActivePersonaId
} from '../../../state/index.js';

export class PersonaService {
  // 获取所有Persona
  async getAll(): Promise<Persona[]> {
    try {
      const personas = await getAllPersonas();
      // 按最近使用时间排序
      return personas.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
    } catch (error) {
      console.error('获取Personas失败:', error);
      throw new Error('获取角色列表失败');
    }
  }

  // 根据ID获取Persona
  async getById(id: string): Promise<Persona | null> {
    try {
      const persona = await getPersonaById(id);
      return persona || null;
    } catch (error) {
      console.error('获取Persona失败:', error);
      throw new Error(`获取角色失败: ${id}`);
    }
  }

  // 创建新Persona
  async create(input: CreatePersonaInput): Promise<Persona> {
    try {
      const now = Date.now();
      const persona: Persona = {
        id: 'persona_' + now,
        ...input,
        version: input.version || 1,
        createdAt: now,
        updatedAt: now,
        lastUsedAt: now,
        publishedAt: input.status === 'published' ? now : undefined
      };

      // 保存到数据库
      await savePersona(persona);
      
      // 更新状态
      addPersona(persona);
      
      console.log('创建Persona成功:', persona.name);
      return persona;
    } catch (error) {
      console.error('创建Persona失败:', error);
      throw new Error('创建角色失败');
    }
  }

  // 更新Persona
  async update(id: string, input: UpdatePersonaInput): Promise<void> {
    try {
      const existingPersona = await this.getById(id);
      if (!existingPersona) {
        throw new Error('角色不存在');
      }

      const updatedPersona: Persona = {
        ...existingPersona,
        ...input,
        updatedAt: Date.now(),
        publishedAt: input.status === 'published' && existingPersona.status !== 'published' 
          ? Date.now() 
          : existingPersona.publishedAt
      };

      // 保存到数据库
      await savePersona(updatedPersona);
      
      // 更新状态
      updatePersonaState(id, updatedPersona);
      
      console.log('更新Persona成功:', id);
    } catch (error) {
      console.error('更新Persona失败:', error);
      throw new Error('更新角色失败');
    }
  }

  // 删除Persona
  async delete(id: string): Promise<void> {
    try {
      // 检查是否被聊天引用
      const referenceCheck = await this.checkReferences(id);
      if (referenceCheck.isReferenced) {
        throw new Error(`无法删除角色，正被以下项引用：${referenceCheck.referencedBy.join(', ')}`);
      }

      await deletePersona(id);
      removePersona(id);
      
      console.log('删除Persona成功:', id);
    } catch (error) {
      console.error('删除Persona失败:', error);
      throw new Error('删除角色失败');
    }
  }

  // 搜索和筛选Persona
  async search(options: SearchOptions): Promise<Persona[]> {
    try {
      const { term, filters } = options;
      
      if (!term.trim() && !filters) {
        return await this.getAll();
      }

      let results: Persona[];

      if (term.trim()) {
        // 使用数据库搜索
        results = await searchPersonas(term, {
          archived: filters?.archived,
          status: filters?.status !== 'all' ? filters?.status : undefined
        });
      } else {
        // 仅筛选
        const allPersonas = await this.getAll();
        results = this.applyFilters(allPersonas, filters || {});
      }

      return results.sort((a, b) => b.lastUsedAt - a.lastUsedAt);
    } catch (error) {
      console.error('搜索Personas失败:', error);
      throw new Error('搜索角色失败');
    }
  }

  // 更新最后使用时间
  async updateLastUsedAt(id: string): Promise<void> {
    try {
      await updatePersonaLastUsedAt(id);
      updatePersonaState(id, { lastUsedAt: Date.now() });
    } catch (error) {
      console.error('更新最后使用时间失败:', error);
      // 不抛出错误，这是非关键操作
    }
  }

  // 复制Persona
  async duplicate(id: string, newName?: string): Promise<Persona> {
    try {
      const originalPersona = await this.getById(id);
      if (!originalPersona) {
        throw new Error('源角色不存在');
      }

      const duplicatedInput: CreatePersonaInput = {
        ...originalPersona,
        name: newName || `${originalPersona.name} (副本)`,
        status: 'draft', // 副本默认为草稿状态
        archived: false
      };

      // 移除不应该复制的字段
      delete (duplicatedInput as any).id;
      delete (duplicatedInput as any).createdAt;
      delete (duplicatedInput as any).updatedAt;
      delete (duplicatedInput as any).lastUsedAt;
      delete (duplicatedInput as any).publishedAt;

      return await this.create(duplicatedInput);
    } catch (error) {
      console.error('复制Persona失败:', error);
      throw new Error('复制角色失败');
    }
  }

  // 归档/取消归档
  async toggleArchive(id: string): Promise<void> {
    try {
      const persona = await this.getById(id);
      if (!persona) {
        throw new Error('角色不存在');
      }

      await this.update(id, { archived: !persona.archived });
    } catch (error) {
      console.error('归档操作失败:', error);
      throw new Error('归档操作失败');
    }
  }

  // 发布/取消发布
  async togglePublish(id: string): Promise<void> {
    try {
      const persona = await this.getById(id);
      if (!persona) {
        throw new Error('角色不存在');
      }

      const newStatus = persona.status === 'published' ? 'draft' : 'published';
      await this.update(id, { status: newStatus });
    } catch (error) {
      console.error('发布操作失败:', error);
      throw new Error('发布操作失败');
    }
  }

  // 批量操作
  async bulkDelete(ids: string[]): Promise<{ success: string[], failed: string[] }> {
    const success: string[] = [];
    const failed: string[] = [];

    for (const id of ids) {
      try {
        await this.delete(id);
        success.push(id);
      } catch (error) {
        console.error(`批量删除失败 ${id}:`, error);
        failed.push(id);
      }
    }

    return { success, failed };
  }

  async bulkArchive(ids: string[], archived: boolean): Promise<{ success: string[], failed: string[] }> {
    const success: string[] = [];
    const failed: string[] = [];

    for (const id of ids) {
      try {
        await this.update(id, { archived });
        success.push(id);
      } catch (error) {
        console.error(`批量归档失败 ${id}:`, error);
        failed.push(id);
      }
    }

    return { success, failed };
  }

  // 私有辅助方法
  private applyFilters(personas: Persona[], filters: FilterOptions): Persona[] {
    let filtered = personas;

    if (filters.type === 'ai') {
      filtered = filtered.filter(p => p.type === 'ai');
    }

    if (filters.status && filters.status !== 'all') {
      filtered = filtered.filter(p => p.status === filters.status);
    }

    if (filters.archived !== undefined) {
      filtered = filtered.filter(p => p.archived === filters.archived);
    }

    if (filters.tags && filters.tags.length > 0) {
      filtered = filtered.filter(p => 
        filters.tags!.some(tag => p.tags.includes(tag))
      );
    }

    return filtered;
  }

  // 验证Persona数据
  validatePersona(input: CreatePersonaInput | UpdatePersonaInput): { isValid: boolean, errors: string[] } {
    const errors: string[] = [];

    if ('name' in input) {
      if (!input.name?.trim()) {
        errors.push('角色名称不能为空');
      } else if (input.name.trim().length > 100) {
        errors.push('角色名称不能超过100个字符');
      }
    }

    if ('prompt' in input && input.prompt) {
      const def = input.prompt.definition || input.prompt.system;
      if (!def?.trim()) {
        errors.push('角色设定不能为空');
      }
    }

    if ('tags' in input && input.tags) {
      if (input.tags.length > 20) {
        errors.push('标签数量不能超过20个');
      }
    }

    return {
      isValid: errors.length === 0,
      errors
    };
  }

  // 检查引用关系（实现引用保护）
  private async checkReferences(personaId: string): Promise<{ isReferenced: boolean; referencedBy: string[] }> {
    try {
      // 检查是否被聊天引用
      const state = (window as any).STATE || (window as any).state;
      const chats = state?.state?.chats || {};
      const referencedBy: string[] = [];

      // 遍历所有聊天，检查personaId引用
      Object.values(chats).forEach((chat: any) => {
        if (chat.personaId === personaId) {
          referencedBy.push(`聊天: ${chat.name}`);
        }
      });

      return {
        isReferenced: referencedBy.length > 0,
        referencedBy
      };
    } catch (error) {
      console.error('检查引用关系失败:', error);
      return { isReferenced: false, referencedBy: [] };
    }
  }
}
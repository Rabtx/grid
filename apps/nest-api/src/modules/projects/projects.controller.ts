import {
	Body,
	Controller,
	Delete,
	Get,
	HttpCode,
	HttpStatus,
	Param,
	ParseIntPipe,
	Patch,
	Post,
	UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';

import type { AccessTokenPayload } from '@/modules/auth/auth.types';
import { CurrentUser } from '@/modules/auth/current-user.decorator';
import { JwtAuthGuard } from '@/modules/auth/jwt-auth.guard';
import { CreateProjectDto, CreateTaskDto, UpdateProjectDto, UpdateTaskDto } from './projects.dto';
import { ProjectsService } from './projects.service';

@ApiTags('Projects')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller({ path: 'projects', version: '1' })
export class ProjectsController {
	constructor(private readonly projects: ProjectsService) {}

	@Get()
	@ApiOperation({ summary: 'List the projects owned by the authenticated user' })
	list(@CurrentUser() user: AccessTokenPayload) {
		return this.projects.listProjects(user.sub);
	}

	@Post()
	@HttpCode(HttpStatus.CREATED)
	@ApiOperation({ summary: 'Create a project' })
	create(@CurrentUser() user: AccessTokenPayload, @Body() body: CreateProjectDto) {
		return this.projects.createProject(user.sub, body);
	}

	@Get(':slug')
	@ApiOperation({ summary: 'Get one project' })
	get(@CurrentUser() user: AccessTokenPayload, @Param('slug') slug: string) {
		return this.projects.getProject(user.sub, slug);
	}

	@Patch(':slug')
	@ApiOperation({ summary: 'Update a project' })
	update(
		@CurrentUser() user: AccessTokenPayload,
		@Param('slug') slug: string,
		@Body() body: UpdateProjectDto,
	) {
		return this.projects.updateProject(user.sub, slug, body);
	}

	@Get(':slug/tasks')
	@ApiOperation({ summary: 'List the tasks on a project board' })
	listTasks(@CurrentUser() user: AccessTokenPayload, @Param('slug') slug: string) {
		return this.projects.listTasks(user.sub, slug);
	}

	@Post(':slug/tasks')
	@HttpCode(HttpStatus.CREATED)
	@ApiOperation({ summary: 'Create a task on a project board' })
	createTask(
		@CurrentUser() user: AccessTokenPayload,
		@Param('slug') slug: string,
		@Body() body: CreateTaskDto,
	) {
		return this.projects.createTask(user.sub, slug, body);
	}

	@Patch(':slug/tasks/:number')
	@ApiOperation({ summary: 'Update a task, including moving it between stages' })
	updateTask(
		@CurrentUser() user: AccessTokenPayload,
		@Param('slug') slug: string,
		@Param('number', ParseIntPipe) number: number,
		@Body() body: UpdateTaskDto,
	) {
		return this.projects.updateTask(user.sub, slug, number, body);
	}

	@Delete(':slug/tasks/:number')
	@HttpCode(HttpStatus.NO_CONTENT)
	@ApiOperation({ summary: 'Delete a task' })
	deleteTask(
		@CurrentUser() user: AccessTokenPayload,
		@Param('slug') slug: string,
		@Param('number', ParseIntPipe) number: number,
	) {
		return this.projects.deleteTask(user.sub, slug, number);
	}
}
